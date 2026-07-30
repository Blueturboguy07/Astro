/* eslint-disable @next/next/no-img-element */
import { PlayCircle, PlusIcon, VideoIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import Lightbox, {
  type GenericSlide,
  type VideoSlide,
} from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { apiFetch } from '@/lib/simplicity/api-fetch'

type Video = {
  url: string
  img_src: string
  title: string
  iframe_src: string
}

declare module 'yet-another-react-lightbox' {
  export interface VideoSlide extends GenericSlide {
    type: 'video-slide'
    src: string
    iframe_src: string
  }

  interface SlideTypes {
    'video-slide': VideoSlide
  }
}

const Searchvideos = ({
  query,
  chatHistory,
  messageId,
}: {
  query: string
  chatHistory: [string, string][]
  messageId: string
}) => {
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [slides, setSlides] = useState<VideoSlide[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const videoRefs = useRef<(HTMLIFrameElement | null)[]>([])

  return (
    <>
      {!loading && videos === null && (
        <button
          id={`search-videos-${messageId}`}
          onClick={async () => {
            setLoading(true)

            const chatModelProvider = localStorage.getItem(
              'chatModelProviderId',
            )
            const chatModel = localStorage.getItem('chatModelKey')

            const res = await apiFetch(`/api/videos`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                query: query,
                chatHistory: chatHistory,
                chatModel: {
                  providerId: chatModelProvider,
                  key: chatModel,
                },
              }),
            })

            const data = await res.json()

            const videos = data.videos ?? []
            setVideos(videos)
            setSlides(
              videos.map((video: Video) => {
                return {
                  type: 'video-slide',
                  iframe_src: video.iframe_src,
                  src: video.img_src,
                }
              }),
            )
            setLoading(false)
          }}
          className="flex w-full flex-row items-center justify-between rounded-lg border border-light-200 border-dashed px-4 py-2 text-sm transition duration-200 hover:bg-light-200 active:scale-95 dark:border-dark-200 dark:text-white dark:hover:bg-dark-200"
        >
          <div className="flex flex-row items-center space-x-2">
            <VideoIcon size={17} />
            <p>Search videos</p>
          </div>
          <PlusIcon className="text-[#24A0ED]" size={17} />
        </button>
      )}
      {loading && (
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="aspect-video h-32 w-full animate-pulse rounded-lg bg-light-secondary object-cover dark:bg-dark-secondary"
            />
          ))}
        </div>
      )}
      {videos !== null && videos.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {videos.length > 4
              ? videos.slice(0, 3).map((video, i) => (
                  <div
                    onClick={() => {
                      setOpen(true)
                      setSlides([
                        slides[i],
                        ...slides.slice(0, i),
                        ...slides.slice(i + 1),
                      ])
                    }}
                    className="relative cursor-pointer transition duration-200 hover:scale-[1.02] active:scale-95"
                    key={i}
                  >
                    <img
                      src={video.img_src}
                      alt={video.title}
                      className="relative aspect-video h-full w-full rounded-lg object-cover"
                    />
                    <div className="absolute right-1 bottom-1 flex flex-row items-center space-x-1 rounded-md bg-white/70 px-2 py-1 text-black/70 dark:bg-black/70 dark:text-white/70">
                      <PlayCircle size={15} />
                      <p className="text-xs">Video</p>
                    </div>
                  </div>
                ))
              : videos.map((video, i) => (
                  <div
                    onClick={() => {
                      setOpen(true)
                      setSlides([
                        slides[i],
                        ...slides.slice(0, i),
                        ...slides.slice(i + 1),
                      ])
                    }}
                    className="relative cursor-pointer transition duration-200 hover:scale-[1.02] active:scale-95"
                    key={i}
                  >
                    <img
                      src={video.img_src}
                      alt={video.title}
                      className="relative aspect-video h-full w-full rounded-lg object-cover"
                    />
                    <div className="absolute right-1 bottom-1 flex flex-row items-center space-x-1 rounded-md bg-white/70 px-2 py-1 text-black/70 dark:bg-black/70 dark:text-white/70">
                      <PlayCircle size={15} />
                      <p className="text-xs">Video</p>
                    </div>
                  </div>
                ))}
            {videos.length > 4 && (
              <button
                onClick={() => setOpen(true)}
                className="flex h-auto w-full flex-col justify-between rounded-lg bg-light-100 p-2 text-white transition duration-200 hover:scale-[1.02] hover:bg-light-200 active:scale-95 dark:bg-dark-100 dark:hover:bg-dark-200"
              >
                <div className="flex flex-row items-center space-x-1">
                  {videos.slice(3, 6).map((video, i) => (
                    <img
                      key={i}
                      src={video.img_src}
                      alt={video.title}
                      className="aspect-video h-6 w-12 rounded-md object-cover lg:h-3 lg:w-6 lg:rounded-sm"
                    />
                  ))}
                </div>
                <p className="text-black/70 text-xs dark:text-white/70">
                  View {videos.length - 3} more
                </p>
              </button>
            )}
          </div>
          <Lightbox
            open={open}
            close={() => setOpen(false)}
            slides={slides}
            index={currentIndex}
            on={{
              view: ({ index }) => {
                const previousIframe = videoRefs.current[currentIndex]
                if (previousIframe?.contentWindow) {
                  previousIframe.contentWindow.postMessage(
                    '{"event":"command","func":"pauseVideo","args":""}',
                    '*',
                  )
                }

                setCurrentIndex(index)
              },
            }}
            render={{
              slide: ({ slide }) => {
                const index = slides.indexOf(slide as (typeof slides)[number])
                return slide.type === 'video-slide' ? (
                  <div className="flex h-full w-full flex-row items-center justify-center">
                    <iframe
                      src={`${slide.iframe_src}${slide.iframe_src.includes('?') ? '&' : '?'}enablejsapi=1`}
                      ref={(el) => {
                        if (el) {
                          videoRefs.current[index] = el
                        }
                      }}
                      className="aspect-video max-h-[95vh] w-[95vw] rounded-2xl md:w-[80vw]"
                      allowFullScreen
                      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                    />
                  </div>
                ) : null
              },
            }}
          />
        </>
      )}
    </>
  )
}

export default Searchvideos
