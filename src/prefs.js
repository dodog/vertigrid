import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {buildCustomCategoriesTab} from './prefs/categoryEditor.js';
import {buildHiddenAppsPage} from './prefs/hiddenApps.js';

// Settings bound one-to-one to widgets in prefs.ui, as [key, widget property]
const BOUND_PROPERTIES = [
    ['animate-scroll', 'active'],
    ['columns', 'value'],
    ['favorites-section', 'active'],
    ['show-favorites-in-app-grid', 'active'],
    ['category-grouping', 'active'],
    ['icon-size', 'value'],
    ['icon-spacing', 'value'],
    ['category-font-size', 'value'],
    ['show-workspaces', 'active'],
    ['always-show-category-nav', 'active'],
    ['clip-app-labels', 'active'],
    ['blur-app-grid-background', 'active']
];

export default class VertiGridPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const builder = new Gtk.Builder();
        builder.add_from_file(`${this.path}/prefs.ui`);

        window.add(builder.get_object('app-grid-page'));
        window.add(builder.get_object('custom-categories-page'));

        for (const [key, property] of BOUND_PROPERTIES)
            settings.bind(key, builder.get_object(key), property, Gio.SettingsBindFlags.DEFAULT);

        this._bindComboRow(builder, settings, 'app-sorting', ['usage', 'alphabetical']);
        this._bindComboRow(builder, settings, 'favorites-sorting', ['dash', 'usage', 'alphabetical']);

        buildCustomCategoriesTab(builder, window, settings);
        buildHiddenAppsPage(window, settings);
    }

    // Bind a combo row to a string setting. A stored value that matches no
    // option (e.g. left over from an older version) falls back to the first one.
    _bindComboRow(builder, settings, key, values) {
        const comboRow = builder.get_object(key);

        comboRow.connect('notify::selected', () => {
            settings.set_string(key, values[comboRow.selected]);
        });

        const index = values.indexOf(settings.get_string(key));
        comboRow.set_selected(index >= 0 ? index : 0);
    }
}
