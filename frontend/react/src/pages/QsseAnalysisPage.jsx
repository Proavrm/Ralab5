import TabQSSE from './components/TabQSSE'

export default function QsseAnalysisPage() {
  return (
    <div className="flex flex-col h-full -m-6 overflow-hidden">
      <div className="flex flex-1 overflow-hidden min-h-0">
        <TabQSSE forcedWorkspaceMode="analysis" registerHref="/qualite?tab=qsse" />
      </div>
    </div>
  )
}