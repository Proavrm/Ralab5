// FILE: RapportPageShell.jsx
// Common layout shell for all report pages.

function RapportPageShell({ managementHeader, toolbar, children, embedded = false, hideToolbar = false }) {
    return (
        <div className="rapport-page-shell">
            <div className="rapport-page-shell-inner">
                {!embedded ? (
                    <div className="rapport-page-interface">
                        {managementHeader}
                    </div>
                ) : null}

                <section className="rapport-work-block">
                    {!embedded ? (
                        <div className="rapport-work-block-header">
                            <div>
                                <div className="rapport-work-block-title">
                                    Édition du rapport
                                </div>
                                <p className="rapport-work-block-description">
                                    Prévisualisation, impression, validation et diffusion du rapport.
                                </p>
                            </div>
                        </div>
                    ) : null}

                    {toolbar && !hideToolbar ? (
                        <div className="rapport-toolbar-frame">
                            {toolbar}
                        </div>
                    ) : null}

                    <div className="rapport-paper-frame">
                        {children}
                    </div>
                </section>
            </div>
        </div>
    )
}

export default RapportPageShell