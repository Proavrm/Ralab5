import { Navigate, useParams } from 'react-router-dom'

export default function AffaireContactsPage() {
  const { uid } = useParams()
  return <Navigate to={`/contacts?affaire_id=${encodeURIComponent(uid || '')}`} replace />
}
