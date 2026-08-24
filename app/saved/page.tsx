import { PageFrame } from '@/components/kindred-shell'
import { SavedList } from '@/components/saved-list'

export default function SavedPage() {
  return (
    <PageFrame active="saved" eyebrow="your collection">
      <SavedList />
    </PageFrame>
  )
}
