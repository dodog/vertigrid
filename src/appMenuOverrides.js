import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';

import {
    InjectionManager,
    gettext as _
} from 'resource:///org/gnome/shell/extensions/extension.js';

// Renames the pin item and adds "Hide this app" to the app menu. Everything
// done here is undone in destroy().
export class AppMenuOverrides {
    constructor(settings) {
        this._settings = settings;
        this._injectionManager = new InjectionManager();

        // AppMenu -> its "Hide this app" item, so destroy() can remove the items
        // from menus that outlive the extension
        this._hideItems = new Map();

        this._installFavoriteLabel();
        this._installHideItem();
    }

    destroy() {
        this._injectionManager.clear();
        this._injectionManager = null;

        for (const item of this._hideItems.values())
            item.destroy();
        this._hideItems = null;
    }

    _hideApp(appId) {
        const hidden = this._settings.get_strv('hidden-apps');
        if (hidden.includes(appId))
            return;

        hidden.push(appId);
        this._settings.set_strv('hidden-apps', hidden);
    }

    _installFavoriteLabel() {
        this._injectionManager.overrideMethod(AppMenu.AppMenu.prototype, '_updateFavoriteItem', originalFn => function () {
            originalFn.call(this);

            if (!this._toggleFavoriteItem.visible)
                return;

            this._toggleFavoriteItem.label.text = this._appFavorites.isFavorite(this._app.id)
                ? _('Remove from Favorites')
                : _('Add to Favorites');
        });
    }

    _installHideItem() {
        const self = this;

        this._injectionManager.overrideMethod(AppMenu.AppMenu.prototype, 'setApp', originalFn => function (app) {
            originalFn.call(this, app);

            if (!self._hideItems.has(this)) {
                const item = this.addAction(_('Hide this app'), () => self._hideApp(this._app.get_id()));
                item.connect('destroy', () => self._hideItems.delete(this));
                self._hideItems.set(this, item);
            }

            self._hideItems.get(this).visible = !!this._app;
        });
    }
}
