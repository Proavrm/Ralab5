export default function EssaiCorrectionBanner({ validation, essaiLabel = 'essai' }) {
    if (!validation?.hasNote && !validation?.isCorrection) {
        return null
    }

    const reasons = Array.isArray(validation.reasons) ? validation.reasons : []
    const isCorrection = Boolean(validation.isCorrection)

    return (
        <div
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="alert"
        >
            <p className="font-semibold">
                {isCorrection
                    ? `Correction demandée sur cet ${essaiLabel}`
                    : `Note de validation — ${essaiLabel}`}
            </p>
            {isCorrection ? (
                <p className="mt-1 text-amber-900/90">
                    Modifiez les données ci-dessous (saisie terrain / calculs), puis enregistrez. Le rapport sera régénéré après revalidation.
                </p>
            ) : null}
            {reasons.length ? (
                <ul className="mt-2 list-disc pl-5 text-[13px] text-amber-900/90">
                    {reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                    ))}
                </ul>
            ) : null}
            {validation.comment ? (
                <div className="mt-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-800/80">
                        Note de validation
                    </div>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2 text-[13px] text-amber-950">
                        {validation.comment}
                    </p>
                </div>
            ) : null}
        </div>
    )
}
