import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/simplicity/api-fetch'

interface Article {
  title: string
  content: string
  url: string
  thumbnail: string
}

const NewsArticleWidget = () => {
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    apiFetch('/api/discover?mode=preview')
      .then((res) => res.json())
      .then((data) => {
        const articles = (data.blogs || []).filter((a: Article) => a.thumbnail)
        setArticle(articles[Math.floor(Math.random() * articles.length)])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  return (
    <div className="flex h-24 max-h-[96px] min-h-[96px] w-full flex-row items-stretch overflow-hidden rounded-2xl border border-light-200 bg-light-secondary p-0 shadow-light-200/10 shadow-sm dark:border-dark-200 dark:bg-dark-secondary dark:shadow-black/25">
      {loading ? (
        <div className="flex h-full w-full animate-pulse flex-row items-stretch">
          <div className="h-full w-24 min-w-24 max-w-24 bg-light-200 dark:bg-dark-200" />
          <div className="flex flex-1 flex-col justify-center gap-2 px-3 py-2">
            <div className="h-4 w-3/4 rounded bg-light-200 dark:bg-dark-200" />
            <div className="h-3 w-1/2 rounded bg-light-200 dark:bg-dark-200" />
          </div>
        </div>
      ) : error ? (
        <div className="w-full text-red-400 text-xs">Could not load news.</div>
      ) : article ? (
        <a
          href={`/?q=Summary: ${article.url}`}
          className="group relative flex h-full w-full flex-row items-stretch overflow-hidden"
        >
          <div className="relative h-full w-24 min-w-24 max-w-24 overflow-hidden">
            <img
              className="h-full w-full bg-light-200 object-cover transition-transform duration-300 group-hover:scale-110 dark:bg-dark-200"
              src={
                new URL(article.thumbnail).origin +
                new URL(article.thumbnail).pathname +
                `?id=${new URL(article.thumbnail).searchParams.get('id')}`
              }
              alt={article.title}
            />
          </div>
          <div className="flex flex-1 flex-col justify-center px-3 py-2">
            <div className="mb-1 line-clamp-2 font-semibold text-black text-xs leading-tight dark:text-white">
              {article.title}
            </div>
            <p className="line-clamp-2 text-[10px] text-black/60 leading-relaxed dark:text-white/60">
              {article.content}
            </p>
          </div>
        </a>
      ) : null}
    </div>
  )
}

export default NewsArticleWidget
