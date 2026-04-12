/**
 * interventionCatalog.js
 * Intervention référentiel for RaLab5.
 */

export const INTERVENTION_TYPE_GROUPS = [
    {
        group: 'Transversal / pilotage',
        options: [
            'Visita técnica',
            'Assistência técnica de obra',
            'Diagnóstico / constatação',
            'Reunião técnica com constatação de terreno',
            'Outro',
        ],
    },
    {
        group: 'Solos / geotecnia / terraplenagens',
        options: [
            'Prelevamento',
            'Reconhecimento geotécnico',
            'Controlo de plataforma',
            'Controlo de compactação',
            'Acompanhamento de terraplenagens',
            'Acompanhamento de tratamento de solos',
        ],
    },
    {
        group: 'Chaussées / enrobés',
        options: [
            'Acompanhamento de enrobés',
        ],
    },
    {
        group: 'Redes / hidráulica',
        options: [
            'Controlo de redes / estanquidade',
            'Infiltração / permeabilidade',
        ],
    },
    {
        group: 'Betão / génie civil',
        options: [
            'Acompanhamento betão / GC',
        ],
    },
]

export const FINALITY_GROUPS = [
    {
        group: 'Solos / geotecnia',
        options: [
            'Identificação / classificação',
            'Estudo GTR',
            'Estudo de tratamento',
            'Aptidão para reutilização em aterro',
            'Aptidão para camada de forma',
            'Reconhecimento geotécnico',
        ],
    },
    {
        group: 'Controlos chantier',
        options: [
            'Controlo de compactação',
            'Controlo de plataforma / portância',
            'Controlo de materiais',
            'Acompanhamento de execução',
        ],
    },
    {
        group: 'Redes / hidráulica',
        options: [
            'Estanquidade',
            'Percolação',
            'Infiltração / permeabilidade',
            'Receção técnica',
        ],
    },
    {
        group: 'Laboratório / prelevamentos',
        options: [
            'Prelevamento para laboratório',
        ],
    },
    {
        group: 'Diagnóstico / expertise',
        options: [
            'Diagnóstico de anomalia',
            'Peritagem / constatação contraditória',
            'Outro',
        ],
    },
]

export const TYPE_TO_FAMILY = {
    'Visita técnica': 'Transversal / pilotage',
    'Assistência técnica de obra': 'Transversal / pilotage',
    'Diagnóstico / constatação': 'Transversal / pilotage',
    'Reunião técnica com constatação de terreno': 'Transversal / pilotage',
    'Outro': 'Transversal / pilotage',

    'Prelevamento': 'Solos / geotecnia / terraplenagens',
    'Reconhecimento geotécnico': 'Solos / geotecnia / terraplenagens',
    'Controlo de plataforma': 'Solos / geotecnia / terraplenagens',
    'Controlo de compactação': 'Solos / geotecnia / terraplenagens',
    'Acompanhamento de terraplenagens': 'Solos / geotecnia / terraplenagens',
    'Acompanhamento de tratamento de solos': 'Solos / geotecnia / terraplenagens',

    'Acompanhamento de enrobés': 'Chaussées / enrobés',

    'Controlo de redes / estanquidade': 'Redes / hidráulica',
    'Infiltração / permeabilidade': 'Redes / hidráulica',

    'Acompanhamento betão / GC': 'Betão / génie civil',
}

export const TYPE_TO_SUGGESTED_FINALITIES = {
    'Visita técnica': [
        'Controlo de materiais',
        'Diagnóstico de anomalia',
        'Receção técnica',
    ],
    'Assistência técnica de obra': [
        'Acompanhamento de execução',
        'Controlo de materiais',
        'Diagnóstico de anomalia',
    ],
    'Diagnóstico / constatação': [
        'Diagnóstico de anomalia',
        'Peritagem / constatação contraditória',
    ],
    'Reunião técnica com constatação de terreno': [
        'Receção técnica',
        'Diagnóstico de anomalia',
    ],
    'Outro': [
        'Outro',
    ],

    'Prelevamento': [
        'Prelevamento para laboratório',
        'Identificação / classificação',
        'Estudo GTR',
        'Estudo de tratamento',
        'Controlo de materiais',
    ],
    'Reconhecimento geotécnico': [
        'Reconhecimento geotécnico',
        'Identificação / classificação',
        'Diagnóstico de anomalia',
    ],
    'Controlo de plataforma': [
        'Controlo de plataforma / portância',
        'Controlo de compactação',
        'Controlo de materiais',
    ],
    'Controlo de compactação': [
        'Controlo de compactação',
        'Controlo de plataforma / portância',
    ],
    'Acompanhamento de terraplenagens': [
        'Acompanhamento de execução',
        'Estudo GTR',
        'Controlo de materiais',
        'Controlo de compactação',
    ],
    'Acompanhamento de tratamento de solos': [
        'Estudo de tratamento',
        'Acompanhamento de execução',
        'Controlo de compactação',
    ],

    'Acompanhamento de enrobés': [
        'Acompanhamento de execução',
        'Controlo de materiais',
        'Diagnóstico de anomalia',
    ],

    'Controlo de redes / estanquidade': [
        'Estanquidade',
        'Percolação',
        'Receção técnica',
        'Diagnóstico de anomalia',
    ],
    'Infiltração / permeabilidade': [
        'Infiltração / permeabilidade',
    ],

    'Acompanhamento betão / GC': [
        'Acompanhamento de execução',
        'Controlo de materiais',
        'Receção técnica',
        'Diagnóstico de anomalia',
    ],
}

export const CODE_REFERENTIAL = [
    { code: 'PA', label: 'Pénétromètre', family: 'Terrain / Réseaux' },
    { code: 'PL', label: 'Portances', family: 'Plateformes / Terrassements' },
    { code: 'PLD', label: 'Portances Dynaplaque', family: 'Plateformes / Terrassements' },
    { code: 'PDL', label: 'Plaque dynamique légère / EV2', family: 'Plateformes / Terrassements' },
    { code: 'DF', label: 'Déflexions', family: 'Chaussées' },
    { code: 'DS', label: 'Densité des sols en place', family: 'Sols / Terrassements' },
    { code: 'DE', label: 'Densité des enrobés en place', family: 'Enrobés / Chaussées' },
    { code: 'INF', label: 'Infiltration / perméabilité', family: 'Hydraulique / Sols' },
    { code: 'EA', label: 'Étanchéité à l’air', family: 'Réseaux / Assainissement' },
    { code: 'EE', label: 'Étanchéité à l’eau', family: 'Réseaux / Assainissement' },
    { code: 'PER PO', label: 'Percolation', family: 'Réseaux / Assainissement' },
    { code: 'PMT', label: 'Macrotexture', family: 'Chaussées / Revêtements' },
    { code: 'TEG', label: 'Taux épandage granulats', family: 'Chaussées / Revêtements' },
    { code: 'TEL', label: 'Taux épandage liant', family: 'Chaussées / Revêtements' },
    { code: 'SO', label: 'Coupe de sondage', family: 'Géotechnique / Reconnaissance' },
    { code: 'SC', label: 'Coupe de sondage carotté', family: 'Géotechnique / Reconnaissance' },
    { code: 'QS', label: 'Contrôle du compactage', family: 'Terrassements' },
    { code: 'CRT', label: 'Consignes de compactage tranchée', family: 'Terrassements / Réseaux' },
    { code: 'STS', label: 'Suivi de traitement des sols', family: 'Sols / Traitement' },
    { code: 'CFE', label: 'Fabrication / contrôle enrobés', family: 'Enrobés' },
]

export const MATERIAL_OPTIONS = [
    'Solo fino / limo / argila',
    'Solo graveleux / materiais de terraplenagem',
    'Reaterro / vala',
    'Camada de forma',
    'GNT / materiais granulares',
    'Balastro / materiais ferroviários',
    'Enrobé / revestimento',
    'Granulados / areia / gravilha',
    'Betão / GC',
    'Rede / canalização',
    'Ouvrage / soutènement / fundação',
    'Água / efluentes / saneamento',
]

export const EQUIPMENT_OPTIONS = [
    'Dynaplaque / placa',
    'Gammadensímetro',
    'Penetrómetro',
    'Deflectógrafo / FWD',
    'Caroteadora',
    'Material de recolha',
    'Kit infiltração / permeabilidade',
    'Kit estanquidade ar / água',
    'Macrotexture',
    'Topografia / nivellement',
    'Veículo / sinalização chantier',
    'EPI reforçados / segurança específica',
]

export function flattenGroupedOptions(groups) {
    return groups.flatMap((group) => group.options)
}

export function getInterventionFamily(typeIntervention) {
    return TYPE_TO_FAMILY[typeIntervention] || ''
}

export function getSuggestedFinalities(typeIntervention) {
    return TYPE_TO_SUGGESTED_FINALITIES[typeIntervention] || []
}
