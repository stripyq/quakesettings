export default function UsefulLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container mx-auto">
      {children}
    </div>
  )
}

