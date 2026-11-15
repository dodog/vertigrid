import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {VerticalAppDisplay} from './appDisplay.js';
import {AppMenuOverrides} from './appMenuOverrides.js';
import {BlurBackground} from './blurBackground.js';
import {OverviewOverrides} from './overviewOverrides.js';

export default class VerticalAppGridExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._appDisplay = new VerticalAppDisplay(this._settings);
        this._blurBackground = new BlurBackground();
        this._overviewOverrides = new OverviewOverrides(this._settings, this._appDisplay, this._blurBackground);
        this._appMenuOverrides = new AppMenuOverrides(this._settings);
    }

    disable() {
        this._appMenuOverrides.destroy();
        this._appMenuOverrides = null;

        this._overviewOverrides.destroy();
        this._overviewOverrides = null;

        this._appDisplay.destroy();
        this._appDisplay = null;

        this._blurBackground.destroy();
        this._blurBackground = null;

        this._settings = null;
    }
}
