// FILE: RapportPageShell.jsx
// Common layout shell for all report pages.

function RapportPageShell({ managementHeader, toolbar, children }) {
    return (
        <div className="rapport-page-shell">
            <div className="rapport-page-shell-inner">
                <div className="rapport-page-interface">
                    {managementHeader}
                </div>

                <section className="rapport-work-block">
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

                    {toolbar ? (
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