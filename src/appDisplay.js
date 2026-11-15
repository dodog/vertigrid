import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as ParentalControlsManager from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {SIDE_CONTROLS_ANIMATION_TIME} from 'resource:///org/gnome/shell/ui/overviewControls.js';

import {
    getCategoryOrder,
    getCategoryContext,
    getAppCategory,
    setCategoryOrder,
    getCategoryOrderMap,
    getCategoryIconMap
} from './categories.js';
import {CategoryNav, categoryLabel} from './categoryNav.js';
import {DragController} from './dragController.js';
import {VerticalScrollView} from './scrollView.js';
import {VerticalLayout} from './layout.js';

// Fixed gap above every section after the first one. Independent of
// icon-spacing since multi-line labels can run into the next separator line.
const SECTION_GAP = 50;

// Extra space after the last section so it can be scrolled further up.
const BOTTOM_SPACER_HEIGHT = 320;

function compareByName(a, b) {
    return a.get_name().toLowerCase().localeCompare(b.get_name().toLowerCase());
}

function sameIds(a, b) {
    return a.size === b.size && [...a].every(id => b.has(id));
}

export const VerticalAppDisplay = GObject.registerClass({
    GTypeName: 'Vertigrid_VerticalAppDisplay'
}, class VerticalAppDisplay extends St.Widget {
    constructor(settings) {
        super({
            layout_manager: new Clutter.BinLayout(),
            can_focus: true,
            reactive: true,
            accessible_role: Atk.Role.LIST
        });

        this._settings = settings;

        this._appSystem = Shell.AppSystem.get_default();
        this._appUsage = Shell.AppUsage.get_default();
        this._appFavorites = AppFavorites.getAppFavorites();
        this._parentalControls = ParentalControlsManager.getDefault();
        this._overview = Main.overview;

        this._nav = new CategoryNav(settings, id => this._scrollToCategory(id));
        this._drag = new DragController(settings, () => this._categoryViews, (category, ids) => {
            setCategoryOrder(this._settings, category, ids);
            this._redisplay();
        });

        this._favoritesLabel = this._createSectionHeader(_('Favorites'));
        this._favoritesView = this._createViewport(false);
        this._mainLabel = this._createSectionHeader(_('All Apps'));
        this._mainView = this._createViewport(false);
        this._bottomSpacer = new St.Widget({
            x_expand: true,
            height: BOTTOM_SPACER_HEIGHT
        });

        this._scrollView = new VerticalScrollView(settings);
        this._scrollView.content.add_child(this._favoritesLabel);
        this._scrollView.content.add_child(this._favoritesView);
        this._scrollView.content.add_child(this._mainLabel);
        this._scrollView.content.add_child(this._mainView);
        this._scrollView.content.add_child(this._bottomSpacer);

        const mainBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            y_expand: true
        });
        mainBox.add_child(this._nav.actor);
        mainBox.add_child(this._scrollView);
        this.add_child(mainBox);

        this._appIcons = [];
        this._categoryLabels = {};
        this._categoryViews = {};

        this._suppressScrollActiveUpdate = false;
        this._suppressScrollActiveUpdateTimeoutId = null;

        this._lastInstalledIds = this._getInstalledIdsSet();

        // Built lazily like the stock grid: when first shown, and whenever
        // _redisplay() queues a rebuild
        this._redisplayWorkId = Main.initializeDeferredWork(this, () => this._rebuild());

        this._connectSignals();
    }

    _connectSignals() {
        this._appSystem.connectObject('installed-changed', () => {
            if (!sameIds(this._lastInstalledIds, this._getInstalledIdsSet()))
                this._redisplay();
        }, this);

        this._appFavorites.connectObject('changed', () => this._redisplay(), this);
        this._parentalControls.connectObject('app-filter-changed', () => this._redisplay(), this);

        this._overview.connectObject('hidden', () => {
            this._scrollView.scrollTo(0, false);
            this._drag.cancel();
            this._nav.resetCollapsed();
        }, this);

        this._settings.connectObject('changed', (_source, key) => {
            switch (key) {
            case 'app-sorting':
            case 'favorites-section':
            case 'favorites-sorting':
            case 'category-grouping':
            case 'show-favorites-in-app-grid':
            case 'category-font-size':
            case 'custom-categories':
            case 'clip-app-labels':
            case 'hidden-apps':
                this._redisplay();
                break;
            case 'icon-spacing':
                this._updateLabelMargins();
                break;
            case 'icon-size':
                this._updateIconSize();
                break;
            case 'always-show-category-nav':
                this._nav.updateAlwaysVisible();
                break;
            }
        }, this);

        // Keep the nav's active-category highlight in sync with the scroll
        // position, whatever caused the scroll (wheel, keys, nav button).
        this._scrollView.vadjustment.connectObject('notify::value',
            () => this._updateActiveCategoryFromScroll(), this);

        // Clicking empty space hides the overview, like clicking the background elsewhere.
        this.connect('button-release-event', () => {
            this._overview.hide();
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _createViewport(reactive) {
        return new St.Viewport({
            layout_manager: new VerticalLayout(this._settings),
            reactive
        });
    }

    _createSectionHeader(text) {
        const row = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER
        });

        const label = new St.Label({
            text,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 16px; font-weight: 400; color: white; margin-right: 10px;'
        });

        const line = new St.Widget({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'min-height: 1px; background-gradient-direction: horizontal; background-gradient-start: rgba(255,255,255,0.3); background-gradient-end: rgba(255,255,255,0);'
        });
        line.set_height(1);

        row.add_child(label);
        row.add_child(line);

        return row;
    }

    _getInstalledIdsSet() {
        return new Set(this._appSystem.get_installed().map(appInfo => appInfo.get_id()));
    }

    _getVisibleApps() {
        const favSection = this._settings.get_boolean('favorites-section');
        const syncFavorites = this._settings.get_boolean('show-favorites-in-app-grid');
        const hiddenApps = new Set(this._settings.get_strv('hidden-apps'));

        const favorites = [];
        const others = [];

        for (const appInfo of this._appSystem.get_installed()) {
            const appId = appInfo.get_id();

            if (!this._parentalControls.shouldShowApp(appInfo) || hiddenApps.has(appId))
                continue;

            if (favSection && this._appFavorites.isFavorite(appId)) {
                favorites.push(appInfo);

                // With sync off, favorites only appear in the favorites section
                if (!syncFavorites)
                    continue;
            }

            others.push(appInfo);
        }

        return {favorites, others};
    }

    _sortedIds(appInfos, sorting) {
        const favIds = this._appFavorites._getIds();

        return appInfos.sort((a, b) => {
            switch (sorting) {
            case 'dash':
                return favIds.indexOf(a.get_id()) - favIds.indexOf(b.get_id());
            case 'usage':
                return this._appUsage.compare(a.get_id(), b.get_id()) || 0;
            default:
                return compareByName(a, b);
            }
        }).map(appInfo => appInfo.get_id());
    }

    // Returns appIds by category, plus 'Other' and '_favorites'.
    _loadAppsByCategory(categoryOrder) {
        const {favorites, others} = this._getVisibleApps();
        const context = getCategoryContext(this._settings);
        const appSorting = this._settings.get_string('app-sorting');

        const appInfosByCategory = {Other: []};
        for (const category of categoryOrder)
            appInfosByCategory[category] = [];

        for (const appInfo of others)
            appInfosByCategory[getAppCategory(appInfo, context)].push(appInfo);

        const idsByCategory = {};
        for (const [category, appInfos] of Object.entries(appInfosByCategory))
            idsByCategory[category] = this._sortedIds(appInfos, appSorting);

        for (const [category, order] of getCategoryOrderMap(this._settings)) {
            if (!idsByCategory[category])
                continue;

            const remaining = new Set(idsByCategory[category]);
            const ordered = order.filter(id => remaining.delete(id));
            idsByCategory[category] = [...ordered, ...idsByCategory[category].filter(id => remaining.has(id))];
        }

        idsByCategory._favorites = this._sortedIds(favorites, this._settings.get_string('favorites-sorting'));

        return idsByCategory;
    }

    _addAppIcons() {
        this._lastInstalledIds = this._getInstalledIdsSet();
        this._appIcons = [];
        this._categoryLabels = {};
        this._categoryViews = {};

        if (this._settings.get_boolean('category-grouping'))
            this._addCategorizedApps();
        else
            this._addFlatApps();

        // Keep the spacer after the last section
        this._scrollView.content.set_child_above_sibling(this._bottomSpacer, null);
    }

    _addFlatApps() {
        this._nav.actor.hide();
        this._nav.clear();

        const {favorites, others} = this._getVisibleApps();
        this._fillView(this._favoritesView, this._sortedIds(favorites, this._settings.get_string('favorites-sorting')));
        this._fillView(this._mainView, this._sortedIds(others, this._settings.get_string('app-sorting')));

        const hasFavorites = this._favoritesView.get_n_children() > 0;
        const hasApps = this._mainView.get_n_children() > 0;

        this._favoritesLabel.visible = hasFavorites;
        this._favoritesView.visible = hasFavorites;
        this._mainLabel.visible = hasFavorites && hasApps;
        this._mainView.visible = hasApps;
    }

    _addCategorizedApps() {
        for (const actor of [this._favoritesLabel, this._favoritesView, this._mainLabel, this._mainView])
            actor.hide();

        const categoryOrder = getCategoryOrder(this._settings);
        const idsByCategory = this._loadAppsByCategory(categoryOrder);

        const visibleIds = [...categoryOrder];
        if (idsByCategory._favorites.length > 0)
            visibleIds.unshift('_favorites');
        if (idsByCategory.Other.length > 0)
            visibleIds.push('Other');

        for (const id of visibleIds)
            this._fillView(this._createSection(id), idsByCategory[id]);

        this._nav.build(visibleIds, getCategoryIconMap(this._settings));
    }

    _createSection(id) {
        const label = this._createSectionHeader(categoryLabel(id));
        const view = this._createViewport(true);

        this._categoryLabels[id] = label;
        this._categoryViews[id] = view;

        this._scrollView.content.add_child(label);
        this._scrollView.content.add_child(view);

        return view;
    }

    _fillView(view, appIds) {
        const iconSize = this._settings.get_int('icon-size');
        const clipLabels = this._settings.get_boolean('clip-app-labels');

        for (const appId of appIds) {
            const app = this._appSystem.lookup_app(appId);
            if (!app)
                continue;

            const appIcon = new AppDisplay.AppIcon(app, {
                isDraggable: false,
                expandTitleOnHover: clipLabels
            });
            appIcon._appId = app.get_id();
            appIcon.icon.setIconSize(iconSize);

            if (!clipLabels)
                this._showFullAppLabel(appIcon);

            this._drag.attach(appIcon);
            view.add_child(appIcon);
            this._appIcons.push(appIcon);
        }
    }

    _showFullAppLabel(appIcon) {
        // AppIcon ellipsizes the name to one line and only shows the full name
        // as a hover overlay. Force it to wrap onto multiple lines instead.
        const clutterText = appIcon.icon.label.clutter_text;
        clutterText.set_line_wrap(true);
        clutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        clutterText.set_single_line_mode(false);
        clutterText.ellipsize = Pango.EllipsizeMode.END;
        appIcon.icon.label.set_style('text-align: center;');
    }

    _scrollToCategory(category) {
        // Without this, the scroll watcher flickers through the categories in between
        this._suppressScrollActiveUpdate = true;
        if (this._suppressScrollActiveUpdateTimeoutId)
            GLib.Source.remove(this._suppressScrollActiveUpdateTimeoutId);

        this._suppressScrollActiveUpdateTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 220, () => {
            this._suppressScrollActiveUpdate = false;
            this._suppressScrollActiveUpdateTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });

        this._scrollView.scrollToChild(this._categoryLabels[category], 'top');
        this._nav.setActive(category);
    }

    // Marks the last category whose header has scrolled to (or past) the top
    // of the viewport as active.
    _updateActiveCategoryFromScroll() {
        const categoryOrder = this._nav.categoryOrder;
        if (this._suppressScrollActiveUpdate || categoryOrder.length === 0)
            return;

        // Slightly below the top, so a section becomes active as its header
        // arrives instead of after it fully clears the edge.
        const threshold = this._scrollView.vadjustment.value + 20;

        let active = categoryOrder[0];
        for (const category of categoryOrder) {
            const label = this._categoryLabels[category];
            if (!label.visible)
                continue;

            if (this._scrollView.getChildY(label) > threshold)
                break;

            active = category;
        }

        if (active !== this._nav.activeCategory)
            this._nav.setActive(active);
    }

    // Queue a rebuild of the grid. It runs when the overview is shown (or
    // right away if it already is), so nothing is rebuilt while it is hidden.
    _redisplay() {
        Main.queueDeferredWork(this._redisplayWorkId);
    }

    _rebuild() {
        this._drag.cancel();

        this._favoritesView.destroy_all_children();
        this._mainView.destroy_all_children();

        Object.values(this._categoryLabels).forEach(label => label.destroy());
        for (const view of Object.values(this._categoryViews)) {
            view.layout_manager.destroy();
            view.destroy();
        }

        this._addAppIcons();
        this._updateLabelMargins();

        this._scrollView.opacity = 0;
        this._scrollView.ease({
            opacity: 255,
            duration: SIDE_CONTROLS_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    }

    _updateLabelMargins() {
        const spacing = this._settings.get_int('icon-spacing');

        const applyMargin = (label, isFirst) => {
            if (label.visible)
                label.set_style(`margin: ${isFirst ? 0 : SECTION_GAP}px 0 ${spacing}px 0;`);
        };

        applyMargin(this._favoritesLabel, true);
        applyMargin(this._mainLabel, false);

        for (const [category, label] of Object.entries(this._categoryLabels))
            applyMargin(label, category === '_favorites');
    }

    _updateIconSize() {
        const size = this._settings.get_int('icon-size');
        this._appIcons.forEach(appIcon => appIcon.icon.setIconSize(size));
    }

    vfunc_key_press_event(event) {
        const key = event.get_key_symbol();
        const focused = global.stage.get_key_focus();

        const adjustment = this._scrollView.vadjustment;
        const pageSize = adjustment.page_size;

        const scroll = {
            [Clutter.KEY_Home]: 0,
            [Clutter.KEY_End]: adjustment.upper - pageSize,
            [Clutter.KEY_Page_Up]: this._scrollView.scroll - pageSize * 0.8,
            [Clutter.KEY_Page_Down]: this._scrollView.scroll + pageSize * 0.8
        };

        if (scroll[key] !== undefined)
            return this._scrollView.scrollTo(scroll[key]);

        const navTarget = this._getNavTarget(focused, key);
        if (!navTarget)
            return Clutter.EVENT_PROPAGATE;

        this._scrollView.scrollToChild(navTarget);
        navTarget.grab_key_focus();

        return Clutter.EVENT_STOP;
    }

    _getNavTarget(focused, key) {
        if (key === Clutter.KEY_Tab || key === Clutter.KEY_ISO_Left_Tab) {
            const index = this._appIcons.indexOf(focused);
            const last = this._appIcons.length - 1;

            if (index === -1)
                return key === Clutter.KEY_Tab ? this._appIcons[0] : this._appIcons[last];

            if (key === Clutter.KEY_Tab)
                return this._appIcons[index < last ? index + 1 : 0];

            return this._appIcons[index > 0 ? index - 1 : last];
        }

        if (key === Clutter.KEY_Right || key === Clutter.KEY_Left ||
            key === Clutter.KEY_Down || key === Clutter.KEY_Up)
            return this._getGridNavTarget(focused, key);

        // Other keys (Enter/Space to launch, type-ahead) are not ours to handle
        return null;
    }

    // Arrow keys wrap into the next/previous section at the end of a row or
    // column; Up/Down land on its first icon instead of preserving the column.
    _getGridNavTarget(focused, key) {
        if (this._appIcons.indexOf(focused) === -1) {
            const forward = key === Clutter.KEY_Right || key === Clutter.KEY_Down;
            return forward ? this._appIcons[0] : this._appIcons[this._appIcons.length - 1];
        }

        if (key === Clutter.KEY_Right || key === Clutter.KEY_Left)
            return this._getHorizontalNavTarget(focused, key);

        return this._getVerticalNavTarget(focused, key);
    }

    _getHorizontalNavTarget(focused, key) {
        const index = this._appIcons.indexOf(focused);
        const last = this._appIcons.length - 1;
        const viewChildren = focused.get_parent().get_children();

        const targetLocalIndex = viewChildren.indexOf(focused) + (key === Clutter.KEY_Right ? 1 : -1);
        if (targetLocalIndex >= 0 && targetLocalIndex < viewChildren.length)
            return viewChildren[targetLocalIndex];

        if (key === Clutter.KEY_Right)
            return this._appIcons[index < last ? index + 1 : 0];
        return this._appIcons[index > 0 ? index - 1 : last];
    }

    _getVerticalNavTarget(focused, key) {
        const last = this._appIcons.length - 1;
        const parentView = focused.get_parent();
        const columns = Math.max(1, parentView.layout_manager._columns);
        const viewChildren = parentView.get_children();
        const down = key === Clutter.KEY_Down;

        const targetLocalIndex = viewChildren.indexOf(focused) + (down ? columns : -columns);
        if (targetLocalIndex >= 0 && targetLocalIndex < viewChildren.length)
            return viewChildren[targetLocalIndex];

        if (down) {
            const targetIndex = this._appIcons.indexOf(viewChildren[viewChildren.length - 1]) + 1;
            return this._appIcons[targetIndex <= last ? targetIndex : 0];
        }

        const prevIndex = this._appIcons.indexOf(viewChildren[0]) - 1;
        const prevSectionLastIcon = this._appIcons[prevIndex >= 0 ? prevIndex : last];
        return prevSectionLastIcon.get_parent().get_children()[0];
    }

    destroy() {
        this._appSystem.disconnectObject(this);
        this._appFavorites.disconnectObject(this);
        this._parentalControls.disconnectObject(this);
        this._overview.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._scrollView.vadjustment.disconnectObject(this);

        this._drag.cancel();
        this._nav.destroy();

        if (this._suppressScrollActiveUpdateTimeoutId) {
            GLib.Source.remove(this._suppressScrollActiveUpdateTimeoutId);
            this._suppressScrollActiveUpdateTimeoutId = null;
        }

        // Destroying the actors does not destroy their layout managers, which
        // hold settings connections, so release those explicitly.
        this._favoritesView.layout_manager.destroy();
        this._mainView.layout_manager.destroy();
        Object.values(this._categoryViews).forEach(view => view.layout_manager.destroy());

        super.destroy();
    }
});
