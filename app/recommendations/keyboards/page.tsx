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

type Keyboard = {
  keyboard: string
  techless: boolean
  diamondLobby: boolean
}

const keyboardData: Keyboard[] = [
  {
    keyboard: "Wooting 80HE",
    techless: true,
    diamondLobby: true
  },
  {
    keyboard: "Keychron Q1 HE",
    techless: true,
    diamondLobby: true
  },
  {
    keyboard: "MCHOSE Ace 60 Pro",
    techless: true,
    diamondLobby: false
  },
  {
    keyboard: "TK 68 V2",
    techless: true,
    diamondLobby: false
  },
  {
    keyboard: "Wooting 60HE",
    techless: true,
    diamondLobby: false
  },
  {
    keyboard: "Keychron K2 HE",
    techless: true,
    diamondLobby: false
  },
  {
    keyboard: "Iqunix EZ63",
    techless: true,
    diamondLobby: false
  },
  {
    keyboard: "NuPhy Halo65 HE",
    techless: true,
    diamondLobby: false
  },
  {
    keyboard: "INQUINIX EZ63",
    techless: false,
    diamondLobby: true
  },
  {
    keyboard: "Drunkdeer",
    techless: false,
    diamondLobby: true
  },
  {
    keyboard: "ASUS ROG Falchion HFX",
    techless: false,
    diamondLobby: true
  }
]

const columns: ColumnDef<Keyboard>[] = [
  {
    accessorKey: "keyboard",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full w-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Keyboard</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const keyboardName = row.getValue("keyboard") as string;
      const productLinks: Record<string, string> = {
        "Wooting 80HE": "https://wooting.io/wooting-80he?partner_id=quakesettings",
        "Keychron Q1 HE": "https://www.amazon.de/s?k=Keychron+Q1+HE&linkCode=progamingge07-20&tag=ll2",
        "MCHOSE Ace 60 Pro": "https://www.amazon.de/s?k=MCHOSE+Ace+60+Pro&linkCode=progamingge07-20&tag=ll2",
        "TK 68 V2": "https://www.amazon.de/s?k=hall+effect+keyboard+iso&linkCode=ll2&tag=progamingge07-20",
        "Wooting 60HE": "https://wooting.io/wooting-60he?partner_id=quakesettings",
        "Keychron K2 HE": "https://www.amazon.de/s?k=Keychron+K2+HE&linkCode=progamingge07-20&tag=ll2",
        "Iqunix EZ63": "https://www.amazon.de/s?k=Iqunix+EZ63&linkCode=progamingge07-20&tag=ll2",
        "NuPhy Halo65 HE": "https://www.amazon.de/s?k=NuPhy+Halo65+HE&linkCode=progamingge07-20&tag=ll2",
        "INQUINIX EZ63": "https://www.amazon.de/s?k=INQUINIX+EZ63&linkCode=progamingge07-20&tag=ll2",
        "Drunkdeer": "https://www.amazon.de/s?k=Drunkdeer&linkCode=progamingge07-20&tag=ll2",
        "ASUS ROG Falchion HFX": "https://www.amazon.de/s?k=ASUS+ROG+Falchion+HFX&linkCode=progamingge07-20&tag=ll2"
      };
      return (
        <div className="w-[190px] font-medium text-left whitespace-nowrap overflow-hidden text-ellipsis">
          <a href={productLinks[keyboardName]} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            {keyboardName}
          </a>
        </div>
      );
    },
  },
  {
    accessorKey: "techless",
    header: ({ column }) => {
      return (
        <div className="w-[40px]">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-2 h-full flex flex-col items-center justify-between"
          >
            <span className="font-bold">techless</span>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[40px] text-center">
        {row.getValue("techless") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "diamondLobby",
    header: ({ column }) => {
      return (
        <div className="w-[40px]">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-2 h-full flex flex-col items-center justify-between"
          >
            <span className="font-bold">Diamond Lobby</span>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[40px] text-center">
        {row.getValue("diamondLobby") ? "✓" : ""}
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

export default function KeyboardsPage() {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data: keyboardData,
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
      <h1 className="text-3xl font-bold mb-2">Keyboard Recommendations</h1>
      <Link href="/recommendations" className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to all recommendations
      </Link>
      <p className="text-gray-600 mb-6">A curated list of gaming keyboards with recommendations from trusted reviewers.</p>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <div className="overflow-x-auto max-w-[1100px]">
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
                  >
                    {row.getVisibleCells().map((cell, index) => (
                      <TableCell
                        key={cell.id}
                        className={index === 0 ? "sticky left-0 bg-background" : ""}
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

