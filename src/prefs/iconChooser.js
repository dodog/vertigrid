import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const MAX_RESULTS = 200;

// Opens a searchable picker over the current icon theme's symbolic icons and
// calls onSelect(iconName) with the chosen icon, or onSelect(null) if the user
// picks "Use Default Icon". Nothing is called if the dialog is cancelled.
export function openIconChooser(window, currentIcon, onSelect) {
    const dialog = new Gtk.Dialog({
        transient_for: window,
        modal: true,
        title: _('Choose an Icon'),
        default_width: 480,
        default_height: 520,
        use_header_bar: true
    });

    dialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
    dialog.add_button(_('Use Default Icon'), Gtk.ResponseType.REJECT);

    const contentArea = dialog.get_content_area();

    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: _('Search symbolic icons (e.g. mail, folder, web)\u2026'),
        margin_top: 8,
        margin_start: 8,
        margin_end: 8
    });
    contentArea.append(searchEntry);

    const scrolled = new Gtk.ScrolledWindow({
        vexpand: true,
        hexpand: true,
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 8,
        margin_end: 8
    });
    contentArea.append(scrolled);

    const flowBox = new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.NONE,
        max_children_per_line: 8,
        row_spacing: 4,
        column_spacing: 4,
        homogeneous: true,
        valign: Gtk.Align.START
    });
    scrolled.set_child(flowBox);

    const hintLabel = new Gtk.Label({
        label: _('Start typing to search your system\u2019s symbolic icons.'),
        margin_top: 24
    });
    hintLabel.add_css_class('dim-label');

    // Only matches become widgets (capped at MAX_RESULTS), so the dialog never
    // builds thousands of images at once.
    const iconTheme = Gtk.IconTheme.get_for_display(window.get_display());
    const allIconNames = iconTheme.get_icon_names()
        .filter(iconName => iconName.endsWith('-symbolic'))
        .sort();

    const populate = query => {
        let child = flowBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            flowBox.remove(child);
            child = next;
        }

        const needle = query.trim().toLowerCase();
        if (!needle) {
            if (scrolled.get_child() !== hintLabel)
                scrolled.set_child(hintLabel);
            return;
        }

        if (scrolled.get_child() !== flowBox)
            scrolled.set_child(flowBox);

        const matches = allIconNames
            .filter(iconName => iconName.toLowerCase().includes(needle))
            .slice(0, MAX_RESULTS);

        for (const iconName of matches) {
            const button = new Gtk.Button({
                tooltip_text: iconName
            });
            button.add_css_class('flat');
            button.set_child(new Gtk.Image({
                icon_name: iconName,
                pixel_size: 24
            }));
            button.connect('clicked', () => {
                onSelect(iconName);
                dialog.destroy();
            });

            flowBox.append(button);
        }
    };

    searchEntry.connect('search-changed', () => populate(searchEntry.get_text()));

    populate(currentIcon || '');
    if (currentIcon)
        searchEntry.set_text(currentIcon);

    dialog.connect('response', (_dialog, response) => {
        if (response === Gtk.ResponseType.REJECT)
            onSelect(null);
        dialog.destroy();
    });

    dialog.present();
    searchEntry.grab_focus();
}
