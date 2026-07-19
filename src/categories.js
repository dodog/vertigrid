/*
Category configuration for app grouping
Custom categories are stored in settings under 'custom-categories', so they
survive extension updates and do not require editing src/categories.js.

Define custom categories as JSON objects with:
 - name: string
 - enabled: boolean
 - merge: string|false
 - order: optional number
*/

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function getSettingsString(settings, key, fallback = '') {
    if (!settings) {
        return fallback;
    }

    try {
        return settings.get_string(key) || fallback;
    } catch (e) {
        log(`vertigrid: Failed to read ${key}: ${e}`);
        return fallback;
    }
}

export function getSettingsStrv(settings, key, fallback = []) {
    if (!settings) {
        return fallback;
    }

    try {
        return settings.get_strv(key) || fallback;
    } catch (e) {
        log(`vertigrid: Failed to read ${key}: ${e}`);
        return fallback;
    }
}

function _resolveExtensionSettings(schemaId) {
    const extensionDir = GLib.path_get_dirname(
        Gio.File.new_for_uri(
            import.meta.url).get_path()
    );
    const schemaDir = GLib.build_filenamev([extensionDir, 'schemas']);
    const compiledSchemaPath = GLib.build_filenamev([schemaDir, 'gschemas.compiled']);

    let schemaSource;
    if (GLib.file_test(compiledSchemaPath, GLib.FileTest.EXISTS)) {
        schemaSource = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir,
            Gio.SettingsSchemaSource.get_default(),
            false
        );
    } else {
        schemaSource = Gio.SettingsSchemaSource.get_default();
    }

    const schemaObj = schemaSource.lookup(schemaId, true);
    if (!schemaObj) {
        throw new Error(`Schema ${schemaId} could not be found in the local or system schema sources.`);
    }

    return new Gio.Settings({
        settings_schema: schemaObj
    });
}

// Lazily resolved and cached rather than constructed eagerly at module
// load: this module is imported both from the GNOME Shell process (via
// appDisplay.js) and from the separate prefs.js process (for
// DEFAULT_CATEGORIES).Failures are caught here and degrade to fallback values instead of throwing at
// import time and breaking the whole module (and anything that imports
// it, including prefs.js opening the preferences window).
let _settingsInstance = null;
let _settingsInitAttempted = false;

function _getSettings() {
    if (!_settingsInitAttempted) {
        _settingsInitAttempted = true;
        try {
            _settingsInstance = _resolveExtensionSettings('org.gnome.shell.extensions.vertigrid');
        } catch (e) {
            log(`vertigrid: Failed to resolve settings schema in categories.js: ${e}`);
            _settingsInstance = null;
        }
    }

    return _settingsInstance;
}

export const DEFAULT_CATEGORIES = [{
        name: 'Development',
        enabled: true,
        merge: false
    },
    {
        name: 'Office',
        enabled: true,
        merge: false
    },
    {
        name: 'Network',
        enabled: true,
        merge: false
    },
    {
        name: 'AudioVideo',
        enabled: false,
        merge: false
    },
    {
        name: 'Audio',
        enabled: true,
        merge: false
    },
    {
        name: 'Video',
        enabled: true,
        merge: false
    },
    {
        name: 'Graphics',
        enabled: true,
        merge: false
    },
    {
        name: 'Education',
        enabled: true,
        merge: false
    },
    {
        name: 'Game',
        enabled: true,
        merge: false
    },
    {
        name: 'Utility',
        enabled: true,
        merge: false
    },
    {
        name: 'Accessories',
        enabled: true,
        merge: false
    },
    {
        name: 'System',
        enabled: true,
        merge: false
    },
    {
        name: 'Settings',
        enabled: true,
        merge: false
    }
];

function _normalizeCategory(category, defaultOrder) {
    if (!category || typeof category !== 'object') {
        return null;
    }

    const name = category.name ? String(category.name).trim() : '';
    if (!name) {
        return null;
    }

    let enabled = true;
    if (category.hasOwnProperty('enabled')) {
        enabled = Boolean(category.enabled);
    }

    let merge = false;
    if (category.hasOwnProperty('merge')) {
        if (category.merge === false || category.merge === null) {
            merge = false;
        } else {
            merge = String(category.merge).trim();
            if (merge === '') {
                merge = false;
            }
        }
    }

    const orderValue = Number(category.order);
    const order = Number.isFinite(orderValue) ? orderValue : null;

    return {
        name,
        enabled,
        merge,
        order,
        _defaultOrder: defaultOrder
    };
}

function _getSettingsStringLocal(key, fallback = '') {
    return getSettingsString(_getSettings(), key, fallback);
}

function _getSettingsStrvLocal(key, fallback = []) {
    return getSettingsStrv(_getSettings(), key, fallback);
}

function _loadCustomCategories() {
    const raw = _getSettingsStringLocal('custom-categories', '[]');
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((category, index) => _normalizeCategory(category, DEFAULT_CATEGORIES.length + index))
            .filter(Boolean);
    } catch (e) {
        log(`vertigrid: Failed to parse custom categories: ${e}`);
        return [];
    }
}

function _categoryNamesEqual(a, b) {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function getCategories() {
    const categories = DEFAULT_CATEGORIES.map((category, index) => ({
        ...category,
        order: null,
        _defaultOrder: index
    }));

    const customCategories = _loadCustomCategories();
    for (const customCategory of customCategories) {
        const existingIndex = categories.findIndex(category => _categoryNamesEqual(category.name, customCategory.name));
        if (existingIndex >= 0) {
            categories[existingIndex] = {
                ...categories[existingIndex],
                ...customCategory
            };
        } else {
            categories.push(customCategory);
        }
    }

    categories.sort((a, b) => {
        const aOrder = Number.isFinite(a.order) ? a.order : a._defaultOrder;
        const bOrder = Number.isFinite(b.order) ? b.order : b._defaultOrder;
        return aOrder - bOrder;
    });

    return categories;
}

export function getCategoryOrder() {
    return getCategories()
        .filter(cat => cat.enabled && !cat.merge)
        .map(cat => cat.name);
}

export function getAllCategories() {
    return [...getCategories().map(cat => cat.name), 'Other'];
}

/** ========== DO NOT MODIFY THE FOLLOWING UNLESS YOU ARE A DEVELOPER ========== **/


// app-category-overrides entries are encoded as "appId::category::index"
// (index optional). These three helpers are the single place that format
// is written and read, instead of each caller re-implementing its own
// split('::')/startsWith() logic.
function _encodeOverrideEntry(appId, category, index) {
    if (index !== null && index !== undefined) {
        return `${appId}::${category}::${Math.floor(index)}`;
    }
    return `${appId}::${category}`;
}

function _parseOverrideEntry(entry) {
    const parts = entry.split('::');
    if (parts.length < 2) {
        return null;
    }

    const id = parts[0];
    const category = parts[1];
    const parsedIndex = parts.length >= 3 ? parseInt(parts[2], 10) : null;

    return {
        id,
        category,
        index: Number.isFinite(parsedIndex) ? parsedIndex : null
    };
}

function _removeOverrideEntriesForApp(arr, appId) {
    return arr.filter(e => !e.startsWith(appId + '::'));
}

function _loadOverrides() {
    const arr = _getSettingsStrvLocal('app-category-overrides', []);
    // Map of appId -> { category: string, index: number|null }
    const map = new Map();
    for (const entry of arr) {
        const parsed = _parseOverrideEntry(entry);
        if (!parsed) {
            continue;
        }
        map.set(parsed.id, {
            category: parsed.category,
            index: parsed.index
        });
    }
    return map;
}

export function setAppCategory(appId, category, index = null) {
    const settings = _getSettings();
    if (!settings) {
        return false;
    }

    try {
        const arr = settings.get_strv('app-category-overrides') || [];
        const overrides = arr
            .map(_parseOverrideEntry)
            .filter(Boolean)
            .filter(entry => entry.id !== appId);

        if (!category || category === 'Other') {
            settings.set_strv('app-category-overrides', overrides.map(entry => _encodeOverrideEntry(entry.id, entry.category, entry.index)));
            return true;
        }

        const numericIndex = Number.isFinite(Number(index)) ? Number(index) : null;
        const target = overrides
            .filter(entry => entry.category === category && entry.index !== null)
            .sort((a, b) => a.index - b.index);
        const others = overrides.filter(entry => entry.category !== category || entry.index === null);

        const result = [...others];
        if (numericIndex === null) {
            result.push({
                id: appId,
                category,
                index: null
            });
        } else {
            const insertPos = Math.max(0, Math.min(numericIndex, target.length));
            const ordered = [];

            for (let i = 0; i < insertPos; i++) {
                ordered.push({
                    id: target[i].id,
                    category,
                    index: i
                });
            }
            ordered.push({
                id: appId,
                category,
                index: insertPos
            });
            for (let i = insertPos; i < target.length; i++) {
                ordered.push({
                    id: target[i].id,
                    category,
                    index: i + 1
                });
            }

            result.push(...ordered);
        }

        settings.set_strv('app-category-overrides', result.map(entry => _encodeOverrideEntry(entry.id, entry.category, entry.index)));
        return true;
    } catch (e) {
        log(`vertigrid: Failed to set app category override: ${e}`);
        return false;
    }
}

export function clearAppCategory(appId) {
    const settings = _getSettings();
    if (!settings) {
        return false;
    }

    try {
        const arr = settings.get_strv('app-category-overrides') || [];
        const filtered = _removeOverrideEntriesForApp(arr, appId);
        settings.set_strv('app-category-overrides', filtered);
        return true;
    } catch (e) {
        log(`vertigrid: Failed to clear app category override: ${e}`);
        return false;
    }
}

/**
 * setCategoryOrder() fix by giving EVERY app in the category an
 * explicit index in one write, so the whole category becomes one
 * consistent, fully interleavable sort. Call this with the complete
 * resulting app-id order for a category whenever a drag-and-drop reorder
 * happens within or into it (see appDisplay.js's drop handler).
 */
export function setCategoryOrder(category, orderedAppIds) {
    const settings = _getSettings();
    if (!settings) {
        return false;
    }

    try {
        const arr = settings.get_strv('app-category-overrides') || [];
        const reindexedIds = new Set(orderedAppIds);

        // Drop any existing entry (in ANY category) for every id that's
        // getting a fresh, authoritative placement below.
        const overrides = arr
            .map(_parseOverrideEntry)
            .filter(Boolean)
            .filter(entry => !reindexedIds.has(entry.id));

        orderedAppIds.forEach((appId, index) => {
            overrides.push({
                id: appId,
                category,
                index
            });
        });

        settings.set_strv('app-category-overrides', overrides.map(entry => _encodeOverrideEntry(entry.id, entry.category, entry.index)));
        return true;
    } catch (e) {
        log(`vertigrid: Failed to set category order: ${e}`);
        return false;
    }
}

export function getCategoryOrderMap() {
    // Returns Map category -> array of appIds sorted by index (asc)
    const overrides = _getSettingsStrvLocal('app-category-overrides', []);
    const buckets = new Map();
    for (const entry of overrides) {
        const parsed = _parseOverrideEntry(entry);
        if (!parsed || parsed.index === null) {
            continue;
        }
        if (!buckets.has(parsed.category)) {
            buckets.set(parsed.category, []);
        }
        buckets.get(parsed.category).push({
            id: parsed.id,
            index: parsed.index
        });
    }
    const result = new Map();
    for (const [cat, arr] of buckets) {
        arr.sort((a, b) => a.index - b.index);
        result.set(cat, arr.map(x => x.id));
    }
    return result;
}

function _isValidTargetCategory(currentCategories, name) {
    // A category is only safe to hand back to the app grid if it's
    // currently enabled and not itself merged elsewhere — i.e. exactly the
    // set getCategoryOrder() exposes. Anything else (a typo'd merge target,
    // a merge into a disabled/removed category, a stale override) must not
    // be returned as-is: the app grid only allocates buckets for that
    // valid set, so an unrecognized name causes it to crash when it tries
    // to push an app into a bucket that doesn't exist.
    return currentCategories.some(c =>
        c.enabled && !c.merge && _categoryNamesEqual(c.name, name)
    );
}

/**
 * Get the category for an app from its desktop file categories
 */
export function getAppCategory(appInfo) {
    try {
        const currentCategories = getCategories();

        const resolve = candidate =>
            _isValidTargetCategory(currentCategories, candidate) ? candidate : 'Other';

        // Check for user overrides first (e.g. drag-and-drop into a
        // category). The override still needs to be resolved through the
        // enabled/merge config below — an override pointing at a disabled
        // or merged category must not bypass that logic.
        try {
            const id = appInfo.get_id();
            const overrides = _loadOverrides();
            if (overrides.has(id)) {
                const overrideCategory = overrides.get(id).category;
                const catConfig = currentCategories.find(c => _categoryNamesEqual(c.name, overrideCategory));
                if (catConfig) {
                    if (!catConfig.enabled) {
                        return 'Other';
                    }
                    if (catConfig.merge) {
                        return resolve(catConfig.merge);
                    }
                    return resolve(catConfig.name);
                }
                // No config found for this category (e.g. it was removed
                // entirely) — fall back to the override value, but only if
                // it still resolves to something valid.
                return resolve(overrideCategory);
            }
        } catch (e) {
            // ignore if appInfo doesn't have get_id
        }
        const categories = appInfo.get_categories();
        if (!categories)
            return 'Other';

        const categoryList = Array.isArray(categories) ?
            categories.map(c => String(c).trim()).filter(Boolean) :
            categories.split(';').map(c => String(c).trim()).filter(Boolean);

        // Walk the app's OWN category list (in the order the .desktop file
        // lists them) rather than our config list. Apps commonly carry
        // several categories at once (e.g. "AudioVideo;Audio;Player;"), and
        // a disabled catch-all like AudioVideo should not block a more
        // specific, enabled/merged category like Audio from matching just
        // because it happens to come first in our config list.
        for (const trimmed of categoryList) {
            if (!trimmed) {
                continue;
            }
            const catConfig = currentCategories.find(c => _categoryNamesEqual(c.name, trimmed));
            if (!catConfig) {
                // Unknown category name to us, keep checking the app's
                // other listed categories.
                continue;
            }
            if (!catConfig.enabled) {
                // This particular category is disabled; the app might
                // still match a different, enabled category it also lists.
                continue;
            }
            if (catConfig.merge) {
                return resolve(catConfig.merge);
            }
            return resolve(catConfig.name);
        }
    } catch (e) {
        console.error('Error getting app category:', e);
    }
    return 'Other';
}