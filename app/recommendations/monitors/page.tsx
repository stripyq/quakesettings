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
import { CheckIcon, ArrowUpDown } from 'lucide-react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"

type Monitor = {
  monitor: string
  size: string
  resolution: string
  panelTech: string
  refreshRate: string
  techless: boolean
  monitorsUnboxed: boolean
}

const monitorData: Monitor[] = [
  {
    monitor: "ASUS ROG Strix OLED XG27AQDMG",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "OLED",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: true
  },
  {
    monitor: "ASUS ROG Swift OLED PG27AQDP",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "OLED",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: true
  },
  {
    monitor: "MSI G274QPX",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "Rapid IPS",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: true
  },
  {
    monitor: "Dell G2724D",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "165Hz",
    techless: true,
    monitorsUnboxed: true
  },
  {
    monitor: "LG 27GR83Q-B",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "165Hz",
    techless: true,
    monitorsUnboxed: true
  },
  {
    monitor: "Asus ROG Swift Pro PG248QP",
    size: "24\"",
    resolution: "1920×1080",
    panelTech: "TN",
    refreshRate: "540Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "Asus ROG Swift PG27AQDP",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "WOLED",
    refreshRate: "480Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "LG UltraGear 27GX790A (GX7)",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "OLED",
    refreshRate: "480Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "Sony InZone M10S",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "WOLED",
    refreshRate: "480Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "Asus ROG Swift PG27AQN",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "360Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "BenQ Zowie XL2566K",
    size: "24.5\"",
    resolution: "1920×1080",
    panelTech: "TN",
    refreshRate: "360Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "ASUS ROG Swift PG32UCDP",
    size: "32\"",
    resolution: "3840×2160",
    panelTech: "WOLED",
    refreshRate: "300Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "Asus TUF Gaming VG259QM",
    size: "25\"",
    resolution: "1920×1080",
    panelTech: "IPS",
    refreshRate: "280Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "Acer XV271UM3",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "270Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "AOC AG276QZD2",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "QD-OLED",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "ASUS ROG Swift OLED PG32UCDP",
    size: "32\"",
    resolution: "3840×2160",
    panelTech: "OLED",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "BenQ Zowie XL2546X",
    size: "25\"",
    resolution: "1920×1080",
    panelTech: "TN",
    refreshRate: "240Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "Gigabyte M27Q X",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "LG 27GS93QE",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "LG 32GS95UE",
    size: "32\"",
    resolution: "3840×2160",
    panelTech: "WOLED",
    refreshRate: "240Hz (4K) / 480Hz (FHD)",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "LG 34GS95QE-B",
    size: "34\"",
    resolution: "3440×1440",
    panelTech: "OLED",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "MSI 271QPX",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "MSI MAG 321UPX QD-OLED",
    size: "32\"",
    resolution: "3840×2160",
    panelTech: "QD-OLED",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "ViewSonic XG2431",
    size: "24\"",
    resolution: "1920×1080",
    panelTech: "IPS",
    refreshRate: "240Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "Gigabyte M27Q",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "170Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "ASUS ROG Strix XG27ACS",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "165Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "Dell Alienware AW3423DWF",
    size: "34\"",
    resolution: "3440×1440",
    panelTech: "QD-OLED",
    refreshRate: "165Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "Koorui 24E3",
    size: "24\"",
    resolution: "1920×1080",
    panelTech: "VA",
    refreshRate: "165Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "LG 27GP83B",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "165Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "MSI G274QPF-QD",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "IPS",
    refreshRate: "165Hz",
    techless: false,
    monitorsUnboxed: true
  },
  {
    monitor: "KTC H24T09P",
    size: "24\"",
    resolution: "1920×1080",
    panelTech: "IPS",
    refreshRate: "144Hz",
    techless: true,
    monitorsUnboxed: false
  },
  {
    monitor: "ASUS ROG Strix XG27AQMR",
    size: "27\"",
    resolution: "2560×1440",
    panelTech: "Fast IPS",
    refreshRate: "240Hz (4K) / 480Hz (FHD)",
    techless: false,
    monitorsUnboxed: false
  }
]

const columns: ColumnDef<Monitor>[] = [
  {
    accessorKey: "monitor",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full w-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Monitor</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
    const monitorName = row.getValue("monitor") as string;
    const amazonLink = `https://www.amazon.de/s?k=${encodeURIComponent(monitorName)}&linkCode=progamingge07-20&tag=ll2`;
    return (
      <div className="w-[300px] font-medium text-left">
        <a href={amazonLink} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
          {monitorName}
        </a>
      </div>
    );
  },
  },
  {
    accessorKey: "size",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Size</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "resolution",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Resolution</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "panelTech",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Panel Tech</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "refreshRate",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Refresh Rate</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
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
    accessorKey: "monitorsUnboxed",
    header: ({ column }) => {
      return (
        <div className="w-[40px]">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-2 h-full flex flex-col items-center justify-between"
          >
            <span className="font-bold whitespace-normal">Monitors Unboxed</span>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[40px] text-center">
        {row.getValue("monitorsUnboxed") ? "✓" : ""}
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

export default function MonitorsPage() {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data: monitorData,
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
      <h1 className="text-3xl font-bold mb-2">Monitor Recommendations</h1>
      <Link href="/recommendations" className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to all recommendations
      </Link>
      <p className="text-gray-600 mb-6">A curated list of multiplayer gaming monitors with most important specs.</p>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <div className="overflow-x-auto max-w-[1100px]">
          <Table>
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

