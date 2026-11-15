/*
Category config and custom category storage helpers.
Custom categories are saved under 'custom-categories' and survive updates.
*/

// Marks strings for xgettext without translating them: these are also matched
// against .desktop Categories= keys, so they are translated at display time.
const N_ = s => s;

const DEFAULT_CATEGORIES = [
    {name: N_('Development'), enabled: true, merge: false},
    {name: N_('Office'), enabled: true, merge: false},
    {name: N_('Network'), enabled: true, merge: false},
    {name: N_('AudioVideo'), enabled: false, merge: false},
    {name: N_('Audio'), enabled: true, merge: false},
    {name: N_('Video'), enabled: true, merge: false},
    {name: N_('Graphics'), enabled: true, merge: false},
    {name: N_('Education'), enabled: true, merge: false},
    {name: N_('Game'), enabled: true, merge: false},
    {name: N_('Utility'), enabled: true, merge: false},
    {name: N_('Accessories'), enabled: true, merge: false},
    {name: N_('System'), enabled: true, merge: false},
    {name: N_('Settings'), enabled: true, merge: false}
];

// Stored categories are user-editable JSON, so normalize them before merging.
function _normalizeCategory(category, defaultOrder) {
    if (!category || typeof category !== 'object')
        return null;

    const name = category.name ? String(category.name).trim() : '';
    if (!name)
        return null;

    const enabled = Object.hasOwn(category, 'enabled') ? Boolean(category.enabled) : true;

    let merge = false;
    if (category.merge)
        merge = String(category.merge).trim() || false;

    const orderValue = Number(category.order);
    const order = Number.isFinite(orderValue) ? orderValue : null;

    const icon = category.icon ? String(category.icon).trim() || null : null;

    return {name, enabled, merge, order, icon, _defaultOrder: defaultOrder};
}

function _loadCustomCategories(settings) {
    let parsed;
    try {
        parsed = JSON.parse(settings.get_string('custom-categories'));
    } catch (e) {
        console.debug(`vertigrid: Failed to parse custom categories: ${e}`);
        return [];
    }

    if (!Array.isArray(parsed))
        return [];

    return parsed
        .map((category, index) => _normalizeCategory(category, DEFAULT_CATEGORIES.length + index))
        .filter(Boolean);
}

function _categoryNamesEqual(a, b) {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// The built-in categories with any stored overrides applied, followed by the
// custom ones, in the order the editor lists them (not sorted for display).
export function loadCategories(settings) {
    const categories = DEFAULT_CATEGORIES.map((category, index) => ({
        ...category,
        order: null,
        icon: null,
        isDefault: true,
        _defaultOrder: index
    }));

    for (const customCategory of _loadCustomCategories(settings)) {
        const existing = categories.find(category => _categoryNamesEqual(category.name, customCategory.name));
        if (existing) {
            // An override of a built-in keeps the built-in's own name and position
            Object.assign(existing, customCategory, {
                name: existing.name,
                _defaultOrder: existing._defaultOrder
            });
        } else {
            categories.push({...customCategory, isDefault: false});
        }
    }

    return categories;
}

function getCategories(settings) {
    return loadCategories(settings).sort((a, b) => {
        const aOrder = Number.isFinite(a.order) ? a.order : a._defaultOrder;
        const bOrder = Number.isFinite(b.order) ? b.order : b._defaultOrder;
        return aOrder - bOrder;
    });
}

export function getCategoryOrder(settings) {
    return getCategories(settings)
        .filter(category => category.enabled && !category.merge)
        .map(category => category.name);
}

// Category name -> custom icon name, for categories that have one.
export function getCategoryIconMap(settings) {
    const map = new Map();
    for (const category of getCategories(settings)) {
        if (category.icon)
            map.set(category.name, category.icon);
    }
    return map;
}

// app-category-overrides stores one JSON string per strv element.
function _parseOverrideEntry(entry) {
    let parsed;
    try {
        parsed = JSON.parse(entry);
    } catch (e) {
        console.debug(`vertigrid: Failed to parse app category override entry: ${e}`);
        return null;
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.category)
        return null;

    const numericIndex = Number(parsed.index);
    const index = parsed.index !== null && parsed.index !== undefined && Number.isFinite(numericIndex)
        ? numericIndex
        : null;

    return {id: String(parsed.id), category: String(parsed.category), index};
}

// Map of appId -> {category, index}
function _loadOverrides(settings) {
    const map = new Map();
    for (const entry of settings.get_strv('app-category-overrides')) {
        const parsed = _parseOverrideEntry(entry);
        if (parsed)
            map.set(parsed.id, {category: parsed.category, index: parsed.index});
    }
    return map;
}

// Writes an explicit index for every app in the category. An override for
// 'Other' only carries ordering, since 'Other' is not a configured category.
export function setCategoryOrder(settings, category, orderedAppIds) {
    const reindexedIds = new Set(orderedAppIds);

    // Drop any existing entry (in any category) for ids that get a fresh placement.
    const overrides = settings.get_strv('app-category-overrides')
        .map(_parseOverrideEntry)
        .filter(entry => entry && !reindexedIds.has(entry.id));

    orderedAppIds.forEach((id, index) => overrides.push({id, category, index}));

    settings.set_strv('app-category-overrides', overrides.map(entry => JSON.stringify({
        id: entry.id,
        category: entry.category,
        index: entry.index
    })));
}

// Category -> appIds sorted by index.
export function getCategoryOrderMap(settings) {
    const buckets = new Map();
    for (const entry of settings.get_strv('app-category-overrides')) {
        const parsed = _parseOverrideEntry(entry);
        if (!parsed || parsed.index === null)
            continue;

        if (!buckets.has(parsed.category))
            buckets.set(parsed.category, []);
        buckets.get(parsed.category).push(parsed);
    }

    const result = new Map();
    for (const [category, entries] of buckets)
        result.set(category, entries.sort((a, b) => a.index - b.index).map(entry => entry.id));

    return result;
}

// Precompute what getAppCategory() needs, so classifying many apps in one
// pass does not re-read settings for each of them.
export function getCategoryContext(settings) {
    return {
        categories: getCategories(settings),
        overrides: _loadOverrides(settings)
    };
}

export function getAppCategory(appInfo, context) {
    const {categories, overrides} = context;

    // Only enabled, non-merged categories are valid buckets.
    const resolve = name => {
        const target = categories.find(c => c.enabled && !c.merge && _categoryNamesEqual(c.name, name));
        return target ? target.name : 'Other';
    };

    const override = overrides.get(appInfo.get_id());
    if (override) {
        const config = categories.find(c => _categoryNamesEqual(c.name, override.category));
        if (config)
            return config.enabled ? resolve(config.merge || config.name) : 'Other';

        // An explicit placement into Other (drag-and-drop or reordering).
        if (_categoryNamesEqual(override.category, 'Other'))
            return 'Other';

        // The override points to a deleted category, so it is stale: fall
        // through to the categories listed in the app's .desktop file.
    }

    // Follow the app's own category order so a specific enabled category can
    // match before a broader disabled one.
    const desktopCategories = appInfo.get_categories()?.split(';') ?? [];
    for (const name of desktopCategories) {
        const config = categories.find(c => _categoryNamesEqual(c.name, name));
        if (!config?.enabled)
            continue;

        return resolve(config.merge || config.name);
    }

    return 'Other';
}
