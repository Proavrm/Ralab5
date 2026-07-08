const FEUILLE_TYPE_REGISTRY = {
    SC: {
        code: 'SC',
        family: 'stratigraphic',
        renderer: 'stratigraphic-carotte',
        title: 'Coupe de sondages',
        flags: {
            usesPointDetailView: true,
            supportsPointDepthIntervalCm: true,
            supportsCarottePhoto: true,
        },
    },
    SO: {
        code: 'SO',
        family: 'stratigraphic',
        renderer: 'stratigraphic-sondage',
        title: 'Coupe de sondages',
        flags: {
            usesPointDetailView: true,
            supportsPointDepthIntervalCm: false,
            supportsCarottePhoto: false,
        },
    },
    DE: {
        code: 'DE',
        family: 'technical-form',
        renderer: 'technical-de',
        title: 'Feuille technique',
        flags: {
            usesPointDetailView: false,
            supportsPointDepthIntervalCm: false,
            supportsCarottePhoto: false,
        },
    },
    PMT: {
        code: 'PMT',
        family: 'technical-form',
        renderer: 'technical-pmt',
        title: 'Feuille technique',
        flags: {
            usesPointDetailView: false,
            supportsPointDepthIntervalCm: false,
            supportsCarottePhoto: false,
        },
    },
    PL: {
        code: 'PL',
        family: 'technical-form',
        renderer: 'technical-plaque',
        title: 'Feuille technique',
        flags: {
            usesPointDetailView: false,
            supportsPointDepthIntervalCm: false,
            supportsCarottePhoto: false,
        },
    },
    PLD: {
        code: 'PLD',
        family: 'technical-form',
        renderer: 'technical-plaque',
        title: 'Feuille technique',
        flags: {
            usesPointDetailView: false,
            supportsPointDepthIntervalCm: false,
            supportsCarottePhoto: false,
        },
    },
    VC: {
        code: 'VC',
        family: 'visit-form',
        renderer: 'visit-chantier',
        title: 'Feuille de visite chantier',
        flags: {
            usesPointDetailView: false,
            supportsPointDepthIntervalCm: false,
            supportsCarottePhoto: false,
            hasRapport: true,
        },
    },
}

const DEFAULT_FEUILLE_TYPE = {
    code: 'GEN',
    family: 'generic',
    renderer: 'generic-terrain',
    title: 'Feuille terrain',
    flags: {
        usesPointDetailView: false,
        supportsPointDepthIntervalCm: false,
        supportsCarottePhoto: false,
    },
}

export function normalizeFeuilleCode(value) {
    return String(value || '').trim().toUpperCase()
}

export function getFeuilleTypeConfig(code) {
    const normalizedCode = normalizeFeuilleCode(code)
    const registered = FEUILLE_TYPE_REGISTRY[normalizedCode]
    if (!registered) {
        return {
            ...DEFAULT_FEUILLE_TYPE,
            code: normalizedCode || DEFAULT_FEUILLE_TYPE.code,
        }
    }

    return {
        ...registered,
        flags: {
            ...DEFAULT_FEUILLE_TYPE.flags,
            ...(registered.flags || {}),
        },
    }
}
