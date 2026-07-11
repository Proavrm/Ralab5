import React from 'react'
import Button from '@/components/ui/Button'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Erreur inattendue.',
    }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f3f6fb] px-6">
          <div className="max-w-lg w-full rounded-2xl border border-[#dbe1ea] bg-white p-6 shadow-sm">
            <h1 className="text-lg font-black text-[#172033] mb-2">Erreur d&apos;affichage</h1>
            <p className="text-[13px] text-[#69758a] mb-4 leading-relaxed">
              {this.state.message}
            </p>
            <Button size="sm" onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
