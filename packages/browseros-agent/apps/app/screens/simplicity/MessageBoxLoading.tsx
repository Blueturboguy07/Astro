/* The answer-slot skeleton. It lives inside the answer column now (see
   MessageBox's pending indicator), so it fills its container instead of
   setting its own width. */
const MessageBoxLoading = () => {
  return (
    <div className="flex w-full animate-pulse flex-col space-y-2 py-1">
      <div className="h-2 w-full rounded-full bg-light-secondary dark:bg-dark-secondary" />
      <div className="h-2 w-9/12 rounded-full bg-light-secondary dark:bg-dark-secondary" />
      <div className="h-2 w-10/12 rounded-full bg-light-secondary dark:bg-dark-secondary" />
    </div>
  )
}

export default MessageBoxLoading
