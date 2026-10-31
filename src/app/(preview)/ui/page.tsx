import type { Metadata } from 'next'
import { Gallery } from './gallery'

export const metadata: Metadata = { title: 'UI gallery · Passage' }

export default function UiGalleryPage() {
  return <Gallery />
}
