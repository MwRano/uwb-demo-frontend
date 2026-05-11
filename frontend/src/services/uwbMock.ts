export type Tag = {
  id: string
  lat: number
  lng: number
  color?: string
}

let tags: Tag[] = [
  { id: 'tag-1', lat: 0, lng: 0, color: '#FF5722' },
]

const subscribers = new Set<(t: Tag[]) => void>()
let intervalId: number | undefined

export function subscribeToUwbMock(cb: (t: Tag[]) => void) {
  subscribers.add(cb)
  // emit current state immediately
  cb(tags)
  return () => subscribers.delete(cb)
}

export function startUwbMock(area?: { width: number; height: number }) {
  if (intervalId) return

  // if an area is provided, initialize tags inside the image coordinate space
  if (area) {
    tags = tags.map((t) => ({
      ...t,
      lat: Math.random() * area.height,
      lng: Math.random() * area.width,
    }))
  }

  const areaVar = area
  intervalId = window.setInterval(() => {
    tags = tags.map((tag) => {
      if (areaVar) {
        const maxDim = Math.max(areaVar.width, areaVar.height)
        const dy = (Math.random() - 0.5) * (maxDim * 0.02)
        const dx = (Math.random() - 0.5) * (maxDim * 0.02)
        let lat = tag.lat + dy
        let lng = tag.lng + dx
        lat = Math.max(0, Math.min(areaVar.height, lat))
        lng = Math.max(0, Math.min(areaVar.width, lng))
        return { ...tag, lat, lng }
      }

      return {
        ...tag,
        lat: tag.lat + (Math.random() - 0.5) * 0.0002,
        lng: tag.lng + (Math.random() - 0.5) * 0.0002,
      }
    })
    subscribers.forEach((cb) => cb(tags))
  }, 1000)
}

export function stopUwbMock() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = undefined
  }
}
