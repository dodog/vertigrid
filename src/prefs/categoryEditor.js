import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {loadCategories} from '../categories.js';
import {openIconChooser} from './iconChooser.js';

// Builds the category editor into the "custom-categories-group" placeholder
// on the Custom Categories tab.
export function buildCustomCategoriesTab(builder, window, settings) {
    const group = builder.get_object('custom-categories-group');

    const outerBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 10,
        margin_top: 6,
        margin_bottom: 6
    });

    const buttonRow = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8
    });
    outerBox.append(buttonRow);

    const addCategoryButton = new Gtk.Button({
        label: _('Add category'),
        icon_name: 'list-add-symbolic',
        halign: Gtk.Align.START
    });
    buttonRow.append(addCategoryButton);

    buttonRow.append(new Gtk.Box({hexpand: true}));

    const saveButton = new Gtk.Button({
        label: _('Save Custom Categories'),
        halign: Gtk.Align.END
    });
    saveButton.add_css_class('suggested-action');
    buttonRow.append(saveButton);

    const errorLabel = new Gtk.Label({
        xalign: 0,
        wrap: true,
        visible: false
    });
    errorLabel.add_css_class('error');
    outerBox.append(errorLabel);

    const listBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE
    });
    listBox.add_css_class('boxed-list');
    outerBox.append(listBox);

    // Each row's live widgets, so their current values can be read on Save
    const rows = [];

    const addRow = (category, atTop = false) => {
        const {row, removeButton, entry} = createCategoryRow(window, category);
        rows.push(entry);

        if (removeButton) {
            removeButton.connect('clicked', () => {
                rows.splice(rows.indexOf(entry), 1);
                listBox.remove(row);
            });
        }

        if (atTop)
            listBox.insert(row, 0);
        else
            listBox.append(row);

        return entry;
    };

    const existing = loadCategories(settings);
    existing.filter(category => !category.isDefault).forEach(category => addRow(category));
    listBox.append(createSeparatorRow());
    existing.filter(category => category.isDefault).forEach(category => addRow(category));

    addCategoryButton.connect('clicked', () => {
        const entry = addRow({
            name: '',
            enabled: true,
            merge: false,
            isDefault: false,
            order: null,
            icon: null
        }, true);
        entry.nameEntry.grab_focus();
    });

    saveButton.connect('clicked', () => {
        const {categories, errorMessage} = collectCategories(rows);

        if (errorMessage) {
            errorLabel.set_text(errorMessage);
            errorLabel.visible = true;
            return;
        }

        errorLabel.visible = false;

        settings.set_string('custom-categories', JSON.stringify(categories));
        showSavedNotice(window);
    });

    group.add(outerBox);
}

function createSeparatorRow() {
    const row = new Gtk.ListBoxRow({
        activatable: false,
        selectable: false
    });
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 4,
        margin_top: 8,
        margin_bottom: 4
    });
    box.append(new Gtk.Separator({
        orientation: Gtk.Orientation.HORIZONTAL
    }));

    const label = new Gtk.Label({
        label: _('Default categories'),
        halign: Gtk.Align.CENTER,
        margin_top: 4
    });
    label.add_css_class('dim-label');
    label.add_css_class('caption-heading');
    box.append(label);

    row.set_child(box);
    return row;
}

// One editor row for a category. Returns the row, its remove button (custom
// categories only) and the widgets to read the values from.
function createCategoryRow(window, category) {
    const {name, enabled, merge, isDefault, order, icon} = category;

    const row = new Gtk.ListBoxRow({
        activatable: false
    });
    const rowBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        margin_top: 10,
        margin_bottom: 10,
        margin_start: 10,
        margin_end: 10
    });
    row.set_child(rowBox);

    const nameLine = createNameLine(name, enabled, isDefault);
    const mergeLine = createMergeLine(merge);
    const orderLine = createOrderLine(order);
    const iconLine = createIconLine(window, icon);

    for (const line of [nameLine, mergeLine, orderLine, iconLine])
        rowBox.append(line.box);

    return {
        row,
        removeButton: nameLine.removeButton,
        entry: {
            nameEntry: nameLine.nameEntry,
            enabledSwitch: nameLine.enabledSwitch,
            mergeCheck: mergeLine.mergeCheck,
            mergeEntry: mergeLine.mergeEntry,
            orderCheck: orderLine.orderCheck,
            orderSpin: orderLine.orderSpin,
            iconState: iconLine.iconState,
            isDefault,
            canonicalName: name
        }
    };
}

// Category name, enabled switch, and a remove button for custom categories
// (built-in ones can be disabled or merged, but not removed).
function createNameLine(name, enabled, isDefault) {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8
    });

    const nameEntry = new Gtk.Entry({
        hexpand: true,
        placeholder_text: _('Category name (e.g. Fonts)'),
        text: isDefault ? _(name) : name,
        editable: !isDefault,
        can_focus: !isDefault
    });
    if (isDefault)
        nameEntry.add_css_class('dim-label');
    box.append(nameEntry);

    box.append(new Gtk.Label({
        label: _('Enabled')
    }));

    const enabledSwitch = new Gtk.Switch({
        active: Boolean(enabled),
        valign: Gtk.Align.CENTER
    });
    box.append(enabledSwitch);

    let removeButton = null;
    if (isDefault) {
        const badge = new Gtk.Label({
            label: _('Built-in'),
            valign: Gtk.Align.CENTER
        });
        badge.add_css_class('dim-label');
        box.append(badge);
    } else {
        removeButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER
        });
        removeButton.add_css_class('flat');
        box.append(removeButton);
    }

    return {box, nameEntry, enabledSwitch, removeButton};
}

function createMergeLine(merge) {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8
    });

    const mergeCheck = new Gtk.CheckButton({
        label: _('Merge into another category'),
        active: Boolean(merge)
    });
    box.append(mergeCheck);

    const mergeEntry = new Gtk.Entry({
        hexpand: true,
        placeholder_text: _('Target category name (e.g. Webdesign)'),
        text: merge ? String(merge) : '',
        sensitive: Boolean(merge)
    });
    box.append(mergeEntry);

    mergeCheck.connect('toggled', () => {
        mergeEntry.sensitive = mergeCheck.active;
        if (!mergeCheck.active)
            mergeEntry.set_text('');
    });

    return {box, mergeCheck, mergeEntry};
}

// Custom sort order. Applies to built-in and custom categories alike;
// categories without one keep their normal position.
function createOrderLine(order) {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8
    });

    const hasOrder = order !== null && order !== undefined && Number.isFinite(Number(order));

    const orderCheck = new Gtk.CheckButton({
        label: _('Custom order'),
        active: hasOrder
    });
    box.append(orderCheck);

    const orderSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: -1000,
            upper: 1000,
            step_increment: 1,
            page_increment: 10
        }),
        value: hasOrder ? Number(order) : 0,
        sensitive: hasOrder,
        valign: Gtk.Align.CENTER
    });
    box.append(orderSpin);

    const hint = new Gtk.Label({
        label: _('Lower numbers appear first'),
        sensitive: hasOrder
    });
    hint.add_css_class('dim-label');
    box.append(hint);

    orderCheck.connect('toggled', () => {
        orderSpin.sensitive = orderCheck.active;
        hint.sensitive = orderCheck.active;
    });

    return {box, orderCheck, orderSpin};
}

// Custom icon, for built-in categories (to override an icon missing from the
// user's icon theme) and custom ones (which otherwise get a generic icon).
function createIconLine(window, icon) {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8
    });

    const iconState = {value: icon || null};

    const preview = new Gtk.Image({
        icon_name: iconState.value || 'image-missing-symbolic',
        pixel_size: 18,
        valign: Gtk.Align.CENTER
    });
    box.append(preview);

    const label = new Gtk.Label({
        label: iconState.value || _('Default icon'),
        hexpand: true,
        xalign: 0,
        valign: Gtk.Align.CENTER
    });
    label.add_css_class('dim-label');
    box.append(label);

    const chooseButton = new Gtk.Button({
        label: _('Choose Icon\u2026'),
        valign: Gtk.Align.CENTER
    });
    box.append(chooseButton);

    chooseButton.connect('clicked', () => {
        openIconChooser(window, iconState.value, selected => {
            iconState.value = selected;
            preview.set_from_icon_name(selected || 'image-missing-symbolic');
            label.set_text(selected || _('Default icon'));
        });
    });

    return {box, iconState};
}

function showSavedNotice(window) {
    const dialog = new Gtk.Dialog({
        transient_for: window,
        modal: true,
        title: _('Custom Categories Saved'),
        default_width: 420,
        use_header_bar: false
    });

    const okButton = dialog.add_button(_('OK'), Gtk.ResponseType.OK);
    okButton.add_css_class('suggested-action');
    dialog.set_default_response(Gtk.ResponseType.OK);

    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 10,
        margin_top: 16,
        margin_bottom: 16,
        margin_start: 16,
        margin_end: 16
    });
    dialog.get_content_area().append(box);

    box.append(new Gtk.Image({
        icon_name: 'dialog-information-symbolic',
        pixel_size: 32,
        halign: Gtk.Align.CENTER
    }));

    box.append(new Gtk.Label({
        xalign: 0.5,
        wrap: true,
        justify: Gtk.Justification.CENTER,
        label: _('Your custom category settings have been \nsaved and applied to the app grid.')
    }));

    dialog.connect('response', () => dialog.destroy());
    dialog.present();
}

// Validate and serialize the editor rows. Built-ins are always written first,
// in their original order, then custom ones, whatever order the editor shows
// them in, so the app grid's category ordering stays stable.
function collectCategories(rows) {
    const orderedRows = [
        ...rows.filter(row => row.isDefault),
        ...rows.filter(row => !row.isDefault)
    ];

    const categories = [];
    const seenNames = new Set();

    for (const row of orderedRows) {
        const name = row.isDefault ? row.canonicalName : row.nameEntry.get_text().trim();

        // Skip empty rows, so users can add a blank row and leave it unused
        if (!name)
            continue;

        const key = name.toLowerCase();
        if (seenNames.has(key)) {
            return {
                categories: [],
                errorMessage: _('Duplicate category name: ') + name
            };
        }
        seenNames.add(key);

        let merge = false;
        if (row.mergeCheck.get_active()) {
            merge = row.mergeEntry.get_text().trim();
            if (!merge) {
                return {
                    categories: [],
                    errorMessage: _('Enter a target category to merge "') + name + _('" into, or uncheck "Merge into another category".')
                };
            }
        }

        const category = {
            name,
            enabled: row.enabledSwitch.get_active(),
            merge
        };

        if (row.orderCheck.get_active())
            category.order = row.orderSpin.get_value_as_int();

        if (row.iconState.value)
            category.icon = row.iconState.value;

        categories.push(category);
    }

    return {categories, errorMessage: null};
}
