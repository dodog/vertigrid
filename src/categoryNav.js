import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {easeOutCubic} from './utils.js';

const CATEGORY_ICONS = {
    _favorites: 'starred-symbolic',
    Other: 'applications-other-symbolic',
    Development: 'utilities-terminal-symbolic',
    Office: 'x-office-document-symbolic',
    Network: 'network-wired-symbolic',
    AudioVideo: 'multimedia-symbolic',
    Audio: 'audio-x-generic-symbolic',
    Video: 'video-x-generic-symbolic',
    Graphics: 'graphics-symbolic',
    Translation: 'emblem-translate-symbolic',
    WebDevelopment: 'internet-web-browser-symbolic',
    PackageManager: 'package-x-generic-symbolic',
    Ebook: 'accessories-text-editor-symbolic',
    HardwareSettings: 'computer-symbolic',
    Finance: 'wallet-symbolic',
    Backup: 'document-save-symbolic',
    Security: 'security-high-symbolic',
    Chat: 'mail-message-new-symbolic',
    Fonts: 'font-panel-symbolic',
    Education: 'accessories-calculator-symbolic',
    Game: 'gamepad-symbolic',
    Utility: 'applications-utilities-symbolic',
    Accessories: 'applications-accessories-symbolic',
    System: 'computer-symbolic',
    Settings: 'emblem-system-symbolic'
};

// Icon opacity values for category-nav states.
const ICON_OPACITY_DEFAULT = 140;
const ICON_OPACITY_HOVER = 217;
const ICON_OPACITY_ACTIVE = 255;

// Fixed nav width; labels fade in/out on hover.
const NAV_WIDTH = 220;
const NAV_TRANSITION_DURATION = 350;

const NAV_ITEM_HEIGHT_COLLAPSED = 30;
const NAV_ITEM_HEIGHT_EXPANDED = 35;

const CATEGORY_BUTTON_STYLE = [
    'margin: 1px 0; padding: 4px 8px; border-radius: 12px; text-align: left;',
    'border: none; border-bottom: 1px solid rgba(255,255,255,0.12);',
    'background-color: transparent; color: rgba(255,255,255,0.92);'
].join(' ');

// The display name of a category id, as used for section headers and nav buttons.
export function categoryLabel(id) {
    if (id === '_favorites')
        return _('Favorites');
    if (id === 'Other')
        return _('Other');
    return _(id);
}

// The category navigation on the left of the app grid: one icon button per
// section that scrolls to it, with labels that expand while the pointer is
// over the nav.
export class CategoryNav {
    constructor(settings, onSelect) {
        this._settings = settings;
        this._onSelect = onSelect;

        this._buttons = [];
        this._categoryOrder = [];
        this._activeCategory = null;
        this._anim = null;

        // The nav starts expanded when "always show category navigation" is on,
        // to avoid a collapsed-then-expand flash on first display.
        this._alwaysVisible = settings.get_boolean('always-show-category-nav');
        this._collapsed = !this._alwaysVisible;

        this.actor = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: false,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            style_class: 'category-nav-box',
            style: `margin-right: 8px; padding: 8px 0 8px 8px; width: ${NAV_WIDTH}px;`
        });

        // Expands the whole nav; each button's own enter/leave only drives icon opacity.
        this.actor.connect('enter-event', () => {
            if (!this._alwaysVisible)
                this._setCollapsed(false);
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('leave-event', () => {
            if (!this._alwaysVisible)
                this._setCollapsed(true);
            return Clutter.EVENT_PROPAGATE;
        });
    }

    // Category ids from top to bottom, as last passed to build()
    get categoryOrder() {
        return this._categoryOrder;
    }

    get activeCategory() {
        return this._activeCategory;
    }

    destroy() {
        this._cancelAnimation();
    }

    build(ids, iconMap) {
        this.clear();

        this._categoryOrder = [...ids];

        const fontSize = this._settings.get_int('category-font-size');

        for (const id of ids)
            this._addButton(id, iconMap.get(id) || CATEGORY_ICONS[id] || 'applications-other-symbolic', fontSize);

        if (this._buttons.length > 0)
            this.setActive(this._buttons[0]._categoryId);

        this.actor.visible = this._buttons.length > 0;
    }

    clear() {
        this._cancelAnimation();

        const buttons = this._buttons;
        this._buttons = [];
        this._activeCategory = null;
        this._categoryOrder = [];

        // Disconnect first so destroying a hovered button does not trigger its leave handler
        for (const button of buttons) {
            button.disconnectObject(this.actor);
            button.destroy();
        }
    }

    setActive(category) {
        this._activeCategory = category;
        this._buttons.forEach(button => this._updateIconOpacity(button));
    }

    updateAlwaysVisible() {
        this._alwaysVisible = this._settings.get_boolean('always-show-category-nav');
        this._setCollapsed(!this._alwaysVisible);
    }

    // Collapsing here would fight "always show category navigation": hover is
    // a no-op in that mode, so nothing would re-expand the nav.
    resetCollapsed() {
        if (!this._alwaysVisible)
            this._setCollapsed(true, false);
    }

    _addButton(id, iconName, fontSize) {
        const button = new St.Button({
            x_expand: true,
            reactive: true,
            can_focus: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
            style: CATEGORY_BUTTON_STYLE
        });
        button._categoryId = id;
        button._isHovered = false;

        const icon = new St.Icon({
            icon_name: iconName,
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-right: 10px;',
            opacity: ICON_OPACITY_DEFAULT
        });
        const label = new St.Label({
            text: categoryLabel(id),
            style_class: 'search-statustext',
            y_align: Clutter.ActorAlign.CENTER,
            style: `font-weight: 500; font-size: ${Math.max(fontSize - 2, 11)}px; margin: 0; color: rgba(255,255,255,0.96);`
        });

        const row = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(icon);
        row.add_child(label);
        button.add_child(row);

        button._icon = icon;
        button._label = label;

        // Apply the current expanded/collapsed state without animating, so a
        // rebuild does not flash the labels.
        label.set_opacity(this._collapsed ? 0 : 255);
        button.set_height(this._collapsed ? NAV_ITEM_HEIGHT_COLLAPSED : NAV_ITEM_HEIGHT_EXPANDED);

        // Explicit enter/leave events, since St.Button's 'hover' property
        // depends on track-hover wiring.
        button.connectObject(
            'clicked', () => this._onSelect(id),
            'enter-event', () => {
                button._isHovered = true;
                this._updateIconOpacity(button);
                return Clutter.EVENT_PROPAGATE;
            },
            'leave-event', () => {
                button._isHovered = false;
                this._updateIconOpacity(button);
                return Clutter.EVENT_PROPAGATE;
            },
            this.actor);

        this.actor.add_child(button);
        this._buttons.push(button);
    }

    _updateIconOpacity(button) {
        let opacity = ICON_OPACITY_DEFAULT;
        if (button._categoryId === this._activeCategory)
            opacity = ICON_OPACITY_ACTIVE;
        else if (button._isHovered)
            opacity = ICON_OPACITY_HOVER;

        button._icon.set_opacity(opacity);
    }

    _setCollapsed(collapsed, animate = true) {
        if (this._collapsed === collapsed)
            return;

        this._collapsed = collapsed;

        const targetHeight = collapsed ? NAV_ITEM_HEIGHT_COLLAPSED : NAV_ITEM_HEIGHT_EXPANDED;
        const targetOpacity = collapsed ? 0 : 255;

        if (animate) {
            this._startAnimation(targetHeight, targetOpacity);
            return;
        }

        this._cancelAnimation();
        for (const button of this._buttons) {
            button.set_height(targetHeight);
            button._label.set_opacity(targetOpacity);
        }
    }

    _startAnimation(targetHeight, targetOpacity) {
        this._cancelAnimation();

        if (this._buttons.length === 0)
            return;

        // Start from the first button's current values, so reversing
        // mid-animation stays smooth.
        const first = this._buttons[0];
        const startHeight = first.height;
        const startOpacity = first._label.opacity;

        if (targetHeight === startHeight && targetOpacity === startOpacity)
            return;

        this._anim = {
            startTime: GLib.get_monotonic_time(),
            duration: NAV_TRANSITION_DURATION * 1000,
            startHeight,
            deltaHeight: targetHeight - startHeight,
            startOpacity,
            deltaOpacity: targetOpacity - startOpacity,
            lock: global.stage.connect('after-paint', () => this._animationFrame())
        };
    }

    _animationFrame() {
        const anim = this._anim;
        const progress = Math.clamp((GLib.get_monotonic_time() - anim.startTime) / anim.duration, 0, 1);
        const eased = easeOutCubic(progress);

        const height = Math.round(anim.startHeight + anim.deltaHeight * eased);
        const opacity = Math.round(anim.startOpacity + anim.deltaOpacity * eased);

        for (const button of this._buttons) {
            button.set_height(height);
            button._label.set_opacity(opacity);
        }

        if (progress >= 1)
            this._cancelAnimation();
        else
            this.actor.queue_redraw();
    }

    _cancelAnimation() {
        if (!this._anim)
            return;

        global.stage.disconnect(this._anim.lock);
        this._anim = null;
    }
}
