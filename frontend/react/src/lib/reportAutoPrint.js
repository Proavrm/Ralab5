import { useEffect } from "react";

export function useReportAutoPrint(searchParams, ready = true) {
    useEffect(() => {
        if (!ready) {
            return undefined;
        }

        if (String(searchParams.get("autoprint") || "").trim() !== "1") {
            return undefined;
        }

        const runPrint = () => {
            try {
                window.focus();
                window.print();
            } catch {
                // Le navigateur peut bloquer print() si la page n'est pas prête.
            }
        };

        const timer = window.setTimeout(runPrint, 900);
        return () => window.clearTimeout(timer);
    }, [searchParams, ready]);
}
