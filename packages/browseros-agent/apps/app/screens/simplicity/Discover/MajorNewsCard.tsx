import { Link } from 'react-router'
import type { Discover } from '@/lib/simplicity/types/discover'

const MajorNewsCard = ({
  item,
  isLeft = true,
}: {
  item: Discover
  isLeft?: boolean
}) => (
  <Link
    to={`/?q=Summary: ${item.url}`}
    className="group flex h-60 w-full flex-row items-stretch gap-6 py-3"
    target="_blank"
  >
    {isLeft ? (
      <>
        <div className="relative h-full w-80 flex-shrink-0 overflow-hidden rounded-2xl">
          <img
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            src={
              new URL(item.thumbnail).origin +
              new URL(item.thumbnail).pathname +
              `?id=${new URL(item.thumbnail).searchParams.get('id')}`
            }
            alt={item.title}
          />
        </div>
        <div className="flex flex-1 flex-col justify-center py-4">
          <h2
            className="mb-3 line-clamp-3 font-light text-3xl leading-tight transition duration-200 group-hover:text-cyan-500 dark:group-hover:text-cyan-300"
            style={{ fontFamily: 'PP Editorial, serif' }}
          >
            {item.title}
          </h2>
          <p className="line-clamp-4 text-base text-black/60 leading-relaxed dark:text-white/60">
            {item.content}
          </p>
        </div>
      </>
    ) : (
      <>
        <div className="flex flex-1 flex-col justify-center py-4">
          <h2
            className="mb-3 line-clamp-3 font-light text-3xl leading-tight transition duration-200 group-hover:text-cyan-500 dark:group-hover:text-cyan-300"
            style={{ fontFamily: 'PP Editorial, serif' }}
          >
            {item.title}
          </h2>
          <p className="line-clamp-4 text-base text-black/60 leading-relaxed dark:text-white/60">
            {item.content}
          </p>
        </div>
        <div className="relative h-full w-80 flex-shrink-0 overflow-hidden rounded-2xl">
          <img
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            src={
              new URL(item.thumbnail).origin +
              new URL(item.thumbnail).pathname +
              `?id=${new URL(item.thumbnail).searchParams.get('id')}`
            }
            alt={item.title}
          />
        </div>
      </>
    )}
  </Link>
)

export default MajorNewsCard
