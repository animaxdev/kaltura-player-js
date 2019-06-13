// @flow
import {Error, EventType as CoreEventType, FakeEvent, loadPlayer, Utils} from '@playkit-js/playkit-js'
import {EventType as UIEventType} from '@playkit-js/playkit-js-ui'
import getLogger from './common/utils/logger'
import {addKalturaParams} from './common/utils/kaltura-params'
import {evaluatePluginsConfig} from './common/plugins/plugins-config'
import {addKalturaPoster as addOVPKalturaPoster} from './ovp/poster'
import {addKalturaPoster as addOTTKalturaPoster} from './ott/poster'
import './assets/style.css'
import {UIWrapper} from './common/ui-wrapper'
import * as providers from './common/provider-manager'

export default class KalturaPlayer {
  _player: Player;
  _playerConfigure: Function;
  _provider: Provider | null = null;
  _uiWrapper: UIWrapper;
  _logger: any;

  constructor(options: KalturaPlayerOptionsObject) {
    this._player = loadPlayer(options);
    this._playerConfigure = this._player.configure.bind(this._player);
    this._logger = getLogger('KalturaPlayer' + Utils.Generator.uniqueId(5));
    this._uiWrapper = new UIWrapper(this._player, options.ui);
    if (providers.exists(options.provider.type)) {
      const Provider = providers.get(options.provider.type);
      this._provider = new Provider(options.provider, __VERSION__);
    }
    Object.assign(this._player, {
      loadMedia: mediaInfo => this.loadMedia(mediaInfo),
      configure: config => this.configure(config),
      setMedia: mediaConfig => this.setMedia(mediaConfig)
    });
    Object.defineProperty(this._player, 'Event', this.Event);
    return this._player;
  }

  configure(config: Object): void {
    this._playerConfigure(config);
    if (config.ui) {
      this._uiWrapper.setConfig(config.ui);
    }
  }

  loadMedia(mediaInfo: ProviderMediaInfoObject): Promise<*> {
    this._logger.debug('loadMedia', mediaInfo);
    if (this._provider === null){
      this._logger.error('loadMedia requires a provider, but no provider was found. Did you forget setting a provider type?');
      return;
    }
    this._player.reset();
    this._player.loadingMedia = true;
    this._uiWrapper.setErrorPresetConfig(mediaInfo);
    this._uiWrapper.setLoadingSpinnerState(true);
    return this._provider.getMediaConfig(mediaInfo)
      .then((mediaConfig) => {
        switch(this._provider.type){
          case "ott":
            addOTTKalturaPoster(mediaConfig.sources, mediaConfig.sources, this._player.dimensions);
            break;
          case "ovp":
            addOVPKalturaPoster(mediaConfig.sources, mediaConfig.sources, this._player.dimensions);
            break;
        }
        return mediaConfig;
      })
      .then(mediaConfig => this.setMedia(mediaConfig))
      .catch(e => this._player.dispatchEvent(
        new FakeEvent(this._player.Event.ERROR, new Error(Error.Severity.CRITICAL, Error.Category.PLAYER, Error.Code.LOAD_FAILED, e))
      ));
  }

  setMedia(mediaConfig: ProviderMediaConfigObject): void {
    this._logger.debug('setMedia', mediaConfig);
    const playerConfig = Utils.Object.copyDeep(mediaConfig);
    Utils.Object.mergeDeep(playerConfig.sources, this._player.config.sources);
    Utils.Object.mergeDeep(playerConfig.plugins, this._player.config.plugins);
    Utils.Object.mergeDeep(playerConfig.session, this._player.config.session);
    addKalturaParams(this._player, playerConfig);
    evaluatePluginsConfig(playerConfig);
    this._uiWrapper.setSeekbarConfig(mediaConfig);
    this._player.configure(playerConfig);
  }

  get Event(): Object {
    return {
      get: () => ({
        Core: CoreEventType,
        UI: UIEventType,
        // For backward compatibility
        ...CoreEventType
      }),
      set: undefined
    };
  }
}
