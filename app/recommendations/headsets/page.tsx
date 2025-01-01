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
import { ArrowUpDown, CheckIcon } from 'lucide-react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"

type Headset = {
  product: string
  type: string
  connection: string
  noiseCancelling: boolean
  microphone: boolean
  price: string
  productLink: string
  gadgetryTech: boolean
  dms: boolean
  goldenSound: boolean
  resolve: boolean
  joshValour: boolean
  crinacle: boolean
  badSeedTech: boolean
}

const headsetData: Headset[] = [
  {
    product: "Audeze Maxwell",
    type: "Over-ear",
    connection: "Wireless",
    noiseCancelling: true,
    microphone: true,
    price: "€ 319",
    productLink: "https://www.amazon.de/s?k=Audeze+Maxwell&linkCode=progamingge07-25&tag=ll7",
    gadgetryTech: true,
    dms: false,
    goldenSound: false,
    resolve: false,
    joshValour: true,
    crinacle: false,
    badSeedTech: true
  },
  {
    product: "Beyerdynamic DT 770 Pro X Limited",
    type: "Over-ear",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 199",
    productLink: "https://www.amazon.de/s?k=Beyerdynamic+DT+770+Pro+X+Limited&linkCode=progamingge07-26&tag=ll8",
    gadgetryTech: false,
    dms: false,
    goldenSound: false,
    resolve: true,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "Crinacle + Truthear Zero Blue",
    type: "In-ear monitors",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 49",
    productLink: "https://www.amazon.de/s?k=Crinacle+++Truthear+Zero+Blue&linkCode=progamingge07-27&tag=ll9",
    gadgetryTech: false,
    dms: false,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "DROP + EPOS/Sennheiser PC38X",
    type: "Over-ear",
    connection: "Wired",
    noiseCancelling: false,
    microphone: true,
    price: "€ 169",
    productLink: "https://www.amazon.de/s?k=DROP+++EPOS/Sennheiser+PC38X&linkCode=progamingge07-28&tag=ll10",
    gadgetryTech: false,
    dms: true,
    goldenSound: false,
    resolve: false,
    joshValour: true,
    crinacle: true,
    badSeedTech: true
  },
  {
    product: "ModMic Wireless",
    type: "Detachable microphone",
    connection: "Wireless",
    noiseCancelling: false,
    microphone: true,
    price: "€ 129",
    productLink: "https://www.amazon.de/s?k=Modmic+Wireless&linkCode=progamingge07-29&tag=ll11",
    gadgetryTech: false,
    dms: false,
    goldenSound: true,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "Sennheiser HD 800S",
    type: "Over-ear",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 1,399",
    productLink: "https://www.amazon.de/s?k=Sennheiser+HD+800S&linkCode=progamingge07-30&tag=ll12",
    gadgetryTech: false,
    dms: true,
    goldenSound: true,
    resolve: true,
    joshValour: true,
    crinacle: true,
    badSeedTech: false
  },
  {
    product: "Sennheiser HD 490 Pro",
    type: "Over-ear",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "Discontinued",
    productLink: "https://www.amazon.de/s?k=Sennheiser+HD+490+Pro&linkCode=progamingge07-31&tag=ll13",
    gadgetryTech: false,
    dms: false,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: true
  },
  {
    product: "Sennheiser HD 560S",
    type: "Over-ear",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 199",
    productLink: "https://www.amazon.de/s?k=Sennheiser+HD+560S&linkCode=progamingge07-32&tag=ll14",
    gadgetryTech: false,
    dms: false,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: true
  },
  {
    product: "EPOS H6PRO Open Wired Open Acoustic Gaming Headset",
    type: "Over-ear",
    connection: "Wired",
    noiseCancelling: false,
    microphone: true,
    price: "€ 179",
    productLink: "https://www.amazon.de/s?k=EPOS+H6PRO+Open+Wired+Open+Acoustic+Gaming+Headset&linkCode=progamingge07-33&tag=ll15",
    gadgetryTech: true,
    dms: false,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "Linsoul SIMGOT EM6L",
    type: "In-ear monitors",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 109",
    productLink: "https://www.amazon.de/s?k=Linsoul+SIMGOT+EM6L&linkCode=progamingge07-34&tag=ll16",
    gadgetryTech: true,
    dms: false,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "Massdrop x Sennheiser HD 6XX",
    type: "Over-ear",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 220",
    productLink: "https://www.amazon.de/s?k=Massdrop+x+Sennheiser+HD+6XX&linkCode=progamingge07-35&tag=ll17",
    gadgetryTech: false,
    dms: true,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "Bose QuietComfort 35 II",
    type: "Over-ear",
    connection: "Wireless",
    noiseCancelling: true,
    microphone: true,
    price: "€ 299",
    productLink: "https://www.amazon.de/s?k=Bose+QuietComfort+35+II&linkCode=progamingge07-36&tag=ll18",
    gadgetryTech: false,
    dms: true,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "HIFIMAN SUNDARA",
    type: "Over-ear",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 349",
    productLink: "https://www.amazon.de/s?k=HIFIMAN+SUNDARA&linkCode=progamingge07-37&tag=ll19",
    gadgetryTech: false,
    dms: true,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "TRUTHEAR x Crinacle ZERO:RED In-ear Monitor",
    type: "In-ear monitors",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 49",
    productLink: "https://www.amazon.de/s?k=TRUTHEAR+x+Crinacle+ZERO:RED+In-ear+Monitor&linkCode=progamingge07-38&tag=ll20",
    gadgetryTech: false,
    dms: false,
    goldenSound: true,
    resolve: false,
    joshValour: false,
    crinacle: false,
    badSeedTech: false
  },
  {
    product: "Koss KSC75",
    type: "On-ear clip headphones",
    connection: "Wired",
    noiseCancelling: false,
    microphone: false,
    price: "€ 25",
    productLink: "https://www.amazon.de/s?k=Koss+KSC75&linkCode=progamingge07-39&tag=ll21",
    gadgetryTech: false,
    dms: false,
    goldenSound: false,
    resolve: false,
    joshValour: false,
    crinacle: true,
    badSeedTech: false
  }
]

const columns: ColumnDef<Headset>[] = [
  {
    accessorKey: "product",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full w-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Product</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const product = row.getValue("product") as string;
      const productLink = row.original.productLink;
      return (
        <div className="w-[300px] font-medium text-left whitespace-nowrap overflow-hidden text-ellipsis">
          <a href={productLink} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            {product}
          </a>
        </div>
      );
    },
  },
  {
    accessorKey: "type",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Type</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="w-[150px]">{row.getValue("type")}</div>,
  },
  {
    accessorKey: "connection",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Connection</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="w-[100px] text-center">{row.getValue("connection")}</div>,
  },
  {
    accessorKey: "noiseCancelling",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Noise<br />Cancelling</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("noiseCancelling") ? "Yes" : "No"}
      </div>
    ),
  },
  {
    accessorKey: "microphone",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Microphone</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("microphone") ? "Yes" : "No"}
      </div>
    ),
  },
  {
    accessorKey: "price",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Approximate Price<br />in Europe</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="w-[100px] text-right font-mono">{row.getValue("price")}</div>,
  },
  {
    accessorKey: "gadgetryTech",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">GadgetryTech</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("gadgetryTech") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "dms",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">DMS</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("dms") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "goldenSound",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Golden<br />Sound</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("goldenSound") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "resolve",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Resolve</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("resolve") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "joshValour",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Josh<br />Valour</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("joshValour") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "crinacle",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Crinacle</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("crinacle") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "badSeedTech",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">BadSeed<br />Tech</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="w-[100px] text-center">
        {row.getValue("badSeedTech") ? "✓" : ""}
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

export default function HeadsetsPage() {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data: headsetData,
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
      <h1 className="text-3xl font-bold mb-2">Headset Recommendations</h1>
      <Link href="/recommendations" className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to all recommendations
      </Link>
      <p className="text-gray-600 mb-6">A curated selection of headphones and audio equipment for gaming and music.</p>

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

