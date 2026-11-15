import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Builds a page listing every app hidden via the right-click context menu,
// each with a button to restore it.
export function buildHiddenAppsPage(window, settings) {
    const page = new Adw.PreferencesPage({
        title: _('Hidden Apps'),
        icon_name: 'view-conceal-symbolic'
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: _('Hidden Apps'),
        description: _('Apps hidden from this extension\u2019s app grid via its right-click menu. They still appear everywhere else (search, other launchers, the system app menu).')
    });
    page.add(group);

    const listBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE
    });
    listBox.add_css_class('boxed-list');

    const emptyLabel = new Gtk.Label({
        label: _('No apps are currently hidden.')
    });
    emptyLabel.add_css_class('dim-label');
    listBox.set_placeholder(emptyLabel);

    group.add(listBox);

    const refresh = () => {
        // Only remove the data rows, not the placeholder set above
        let child = listBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            if (child instanceof Gtk.ListBoxRow)
                listBox.remove(child);
            child = next;
        }

        for (const appId of settings.get_strv('hidden-apps'))
            listBox.append(createRow(settings, appId));
    };

    refresh();

    // Also reacts to apps hidden while this window is open.
    const changedId = settings.connect('changed::hidden-apps', refresh);
    window.connect('close-request', () => {
        settings.disconnect(changedId);
        return false;
    });
}

function createRow(settings, appId) {
    const appInfo = Gio.DesktopAppInfo.new(appId);

    const row = new Gtk.ListBoxRow({
        activatable: false
    });
    const rowBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 10,
        margin_end: 10
    });
    row.set_child(rowBox);

    rowBox.append(new Gtk.Label({
        label: appInfo ? appInfo.get_display_name() : appId,
        hexpand: true,
        xalign: 0
    }));

    const restoreButton = new Gtk.Button({
        label: _('Restore'),
        valign: Gtk.Align.CENTER
    });
    restoreButton.connect('clicked', () => {
        const current = settings.get_strv('hidden-apps');
        settings.set_strv('hidden-apps', current.filter(id => id !== appId));
    });
    rowBox.append(restoreButton);

    return row;
}
