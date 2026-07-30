import { Link } from 'react-router'
import type { Discover } from '@/lib/simplicity/types/discover'

const SmallNewsCard = ({ item }: { item: Discover }) => (
  <Link
    to={`/?q=Summary: ${item.url}`}
    className="group flex flex-col overflow-hidden rounded-3xl bg-light-secondary shadow-light-200/10 shadow-sm dark:bg-dark-secondary dark:shadow-black/25"
    target="_blank"
  >
    <div className="relative aspect-video overflow-hidden">
      <img
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        src={
          new URL(item.thumbnail).origin +
          new URL(item.thumbnail).pathname +
          `?id=${new URL(item.thumbnail).searchParams.get('id')}`
        }
        alt={item.title}
      />
    </div>
    <div className="p-4">
      <h3 className="mb-2 line-clamp-2 font-semibold text-sm leading-tight transition duration-200 group-hover:text-cyan-500 dark:group-hover:text-cyan-300">
        {item.title}
      </h3>
      <p className="line-clamp-2 text-black/60 text-xs leading-relaxed dark:text-white/60">
        {item.content}
      </p>
    </div>
  </Link>
)

export default SmallNewsCard
