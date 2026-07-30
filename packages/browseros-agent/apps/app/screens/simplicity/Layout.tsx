const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="min-h-screen bg-light-primary lg:pl-20 dark:bg-dark-primary">
      <div className="mx-4 max-w-screen-lg lg:mx-auto">{children}</div>
    </main>
  )
}

export default Layout
