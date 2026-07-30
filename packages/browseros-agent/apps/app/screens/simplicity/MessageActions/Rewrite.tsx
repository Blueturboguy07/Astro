import { Repeat } from 'lucide-react'

const Rewrite = ({
  rewrite,
  messageId,
}: {
  rewrite: (messageId: string) => void
  messageId: string
}) => {
  return (
    <button
      onClick={() => rewrite(messageId)}
      className="flex flex-row items-center space-x-1 rounded-full p-2 text-black/70 transition duration-200 hover:bg-light-secondary hover:text-black dark:text-white/70 dark:hover:bg-dark-secondary dark:hover:text-white"
    >
      <Repeat size={16} />
    </button>
  )
}
1
export default Rewrite
