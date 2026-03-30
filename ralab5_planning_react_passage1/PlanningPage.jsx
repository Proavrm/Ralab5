/**
 * pages/PlanningPage.jsx
 * Legacy planning mounted inside React.
 */
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

export default function PlanningPage() {
    const location = useLocation()
    const src = useMemo(() => {
        const query = location.search || ''
        return `/planning-legacy.html${query}`
    }, [location.search])

    return (
        <div className="-m-6 h-[calc(100vh-48px)] overflow-hidden bg-white">
            <iframe
                key={src}
                title="Planning RaLab5"
                src={src}
                className="h-full w-full border-0 bg-white"
            />
        </div>
    )
}
