"use client"

import * as React from "react"
import Link from "next/link"
import { ErrorBoundary } from 'react-error-boundary'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from 'lucide-react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"

type Mousepad = {
  mousepad: string
  material: string
  diamondLobby: boolean
  boardzy: boolean
  productLink: string
}

const mousepadData: Mousepad[] = [
  {
    mousepad: "Artisan HAYATE-OTSU",
    material: "Cloth",
    diamondLobby: false,
    boardzy: true,
    productLink: "https://www.amazon.de/s?k=Artisan+HAYATE-OTSU&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan HIEN",
    material: "Cloth",
    diamondLobby: false,
    boardzy: true,
    productLink: "https://www.amazon.de/s?k=Artisan+HIEN&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan Key-83",
    material: "Cloth",
    diamondLobby: false,
    boardzy: true,
    productLink: "https://www.amazon.de/s?k=Artisan+Key-83&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan RAIDEN",
    material: "Cloth",
    diamondLobby: false,
    boardzy: true,
    productLink: "https://www.amazon.de/s?k=Artisan+RAIDEN&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan Type-99",
    material: "Cloth",
    diamondLobby: false,
    boardzy: true,
    productLink: "https://www.amazon.de/s?k=Artisan+Type-99&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan ZERO",
    material: "Cloth",
    diamondLobby: false,
    boardzy: true,
    productLink: "https://www.amazon.de/s?k=Artisan+ZERO&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Coolermaster MP511",
    material: "Cordura",
    diamondLobby: true,
    boardzy: false,
    productLink: "https://www.amazon.de/s?k=Coolermaster+MP511+&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Endgame Gear MPC 450",
    material: "Cordura",
    diamondLobby: true,
    boardzy: false,
    productLink: "https://www.amazon.de/s?k=Endgame+Gear+MPC+450&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "La Onda Blitz",
    material: "Cloth",
    diamondLobby: false,
    boardzy: true,
    productLink: "https://www.maxgaming.com/search?q=La+Onda+Blitz"
  },
  {
    mousepad: "Lethal Gaming Gear Saturn Pro",
    material: "Cloth",
    diamondLobby: false,
    boardzy: true,
    productLink: "https://www.amazon.de/s?k=Lethal+Gaming+Gear+Saturn+Pro&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Pulsar Superglide Mousepad",
    material: "Glass",
    diamondLobby: true,
    boardzy: false,
    productLink: "https://www.amazon.de/s?k=Pulsar+Superglide+Mousepad&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Razer Atlas",
    material: "Glass",
    diamondLobby: true,
    boardzy: false,
    productLink: "https://www.amazon.de/s?k=Razer+Atlas+&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "SteelSeries QcK Heavy",
    material: "Cloth",
    diamondLobby: true,
    boardzy: false,
    productLink: "https://www.amazon.de/s?k=SteelSeries+QcK+Heavy&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Xtrfy GP5",
    material: "Cloth",
    diamondLobby: true,
    boardzy: false,
    productLink: "https://www.amazon.de/s?k=Xtrfy+GP5&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "ZOWIE G-SR II",
    material: "Cloth",
    diamondLobby: true,
    boardzy: false,
    productLink: "https://www.amazon.de/s?k=ZOWIE+G-SR+II&linkCode=progamingge07-20&tag=ll2"
  }
]

const columns: ColumnDef<Mousepad>[] = [
  {
    accessorKey: "mousepad",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full w-full flex flex-col items-center justify-between"
          aria-label="Sort by Mousepad"
        >
          <span className="font-bold">Mousepad</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const mousepad = row.getValue("mousepad") as string;
      const productLink = row.original.productLink;
      return (
        <div className="w-[250px] font-medium text-left whitespace-nowrap overflow-hidden text-ellipsis">
          <a href={productLink} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            {mousepad}
          </a>
        </div>
      );
    },
  },
  {
    accessorKey: "material",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full w-full flex flex-col items-center justify-between"
          aria-label="Sort by Material"
        >
          <span className="font-bold">Material</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="w-[100px] text-center">{row.getValue("material")}</div>,
  },
  {
    accessorKey: "diamondLobby",
    header: ({ column }) => {
      return (
        <div className="w-[100px] h-[120px] relative">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="absolute top-0 left-0 w-full h-full"
            aria-label="Sort by Diamond Lobby recommendation"
          >
            <span className="font-bold transform -rotate-60 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              Diamond Lobby
            </span>
            <ArrowUpDown className="h-4 w-4 absolute bottom-2 left-1/2 -translate-x-1/2" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] h-full flex items-center justify-center">
        <span className="flex items-center justify-center w-full h-full">
          {row.getValue("diamondLobby") ? "✓" : ""}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "boardzy",
    header: ({ column }) => {
      return (
        <div className="w-[100px] h-[120px] relative">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="absolute top-0 left-0 w-full h-full"
            aria-label="Sort by boardzy recommendation"
          >
            <span className="font-bold transform -rotate-60 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              boardzy
            </span>
            <ArrowUpDown className="h-4 w-4 absolute bottom-2 left-1/2 -translate-x-1/2" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] h-full flex items-center justify-center">
        <span className="flex items-center justify-center w-full h-full">
          {row.getValue("boardzy") ? "✓" : ""}
        </span>
      </div>
    ),
  },
]

function ErrorFallback({
  error,
  resetErrorBoundary
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export default function MousepadsPage() {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data: mousepadData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  })

  return (
    <main className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-2">Mousepad Recommendations</h1>
      <Link href="/recommendations" className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to all recommendations
      </Link>
      <p className="text-gray-600 mb-6">A selection of mousepads with different materials and surface types.</p>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <div className="overflow-x-auto">
          <Table className="w-auto">
            <TableHeader className="sticky top-0 z-10 bg-white">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header, index) => (
                    <TableHead
                      key={header.id}
                      className={`${
                        index === 0 ? 'sticky left-0 z-20 bg-background' : ''
                      } p-0`}
                    >
                      {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={row.index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    {row.getVisibleCells().map((cell, index) => (
                      <TableCell
                        key={cell.id}
                        className={`${index === 0 ? "sticky left-0 bg-background" : ""} py-2 px-4`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </ErrorBoundary>
    </main>
  )
}

