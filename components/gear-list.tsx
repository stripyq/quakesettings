"use client"

import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { gearData, GearItem } from "@/data/gear-data"

const createAmazonLink = (productName: string) => {
  return `https://www.amazon.de/s?k=${encodeURIComponent(productName)}&linkCode=progamingge07-20&tag=ll2`;
};

const formatNumber = (value: any, column: string): string => {
  if (typeof value === 'string' && value !== 'nan') {
    const numValue = parseFloat(value);
    if (Number.isInteger(numValue)) {
      if (column === 'acceleration' && numValue === 0) {
        return '';
      }
      return numValue.toString();
    }
    return numValue.toFixed(2);
  }
  return '';
};

const columns: ColumnDef<GearItem>[] = [
  {
    accessorKey: "nickname",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Nickname</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("nickname");
      return <div className="font-medium">{value !== "nan" ? String(value) : ""}</div>;
    },
  },
  {
    accessorKey: "mouse",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Mouse</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("mouse");
      return value !== "nan" ? (
        <div className="w-[200px]">
          <a 
            href={createAmazonLink(String(value))}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {String(value)}
          </a>
        </div>
      ) : null;
    },
  },
  {
    accessorKey: "mousepad",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Mousepad</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("mousepad");
      return value !== "nan" ? (
        <div className="w-[200px]">
          <a 
            href={createAmazonLink(String(value))}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {String(value)}
          </a>
        </div>
      ) : null;
    },
  },
  {
    accessorKey: "keyboard",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Keyboard</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("keyboard");
      return value !== "nan" ? (
        <div className="w-[200px]">
          <a 
            href={createAmazonLink(String(value))}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {String(value)}
          </a>
        </div>
      ) : null;
    },
  },
  {
    accessorKey: "monitor",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Monitor</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("monitor");
      return value !== "nan" ? (
        <div className="w-[200px]">
          <a 
            href={createAmazonLink(String(value))}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {String(value)}
          </a>
        </div>
      ) : null;
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
    cell: ({ row }) => {
      const value = row.getValue("size");
      return <div>{value !== "nan" ? String(value) : ""}</div>;
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
    cell: ({ row }) => {
      const value = row.getValue("refreshRate");
      return <div>{value !== "nan" ? String(value) : ""}</div>;
    },
  },
  {
    accessorKey: "headphones",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Headphones</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("headphones");
      return <div className="w-[200px]">{value !== "nan" ? String(value) : ""}</div>;
    },
  },
  {
    accessorKey: "invertedMouse",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Inverted Mouse</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("invertedMouse");
      return <div>{value !== "nan" ? String(value) : ""}</div>;
    },
  },
  {
    accessorKey: "mouseDPI",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Mouse DPI</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("mouseDPI");
      return <div>{value !== "nan" ? parseInt(String(value), 10) : ""}</div>;
    },
  },
  {
    accessorKey: "inGameSensitivity",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">In-game Sensitivity</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("inGameSensitivity");
      return <div>{formatNumber(value, "inGameSensitivity")}</div>;
    },
  },
  {
    accessorKey: "eDPI",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">eDPI</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("eDPI");
      return <div>{formatNumber(value, "eDPI")}</div>;
    },
  },
  {
    accessorKey: "cm360",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">cm/360°</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("cm360");
      return <div>{formatNumber(value, "cm360")}</div>;
    },
  },
  {
    accessorKey: "acceleration",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Acceleration</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("acceleration");
      return <div>{formatNumber(value, "acceleration")}</div>;
    },
  },
  {
    accessorKey: "fov",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">FOV</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("fov");
      return <div>{formatNumber(value, "fov")}</div>;
    },
  },
  {
    accessorKey: "crosshair",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Crosshair</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("crosshair");
      return <div>{value !== "nan" ? String(value) : ""}</div>;
    },
  },
  {
    accessorKey: "crosshairColor",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Crosshair Color</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("crosshairColor");
      return <div>{value !== "nan" ? String(value) : ""}</div>;
    },
  },
  {
    accessorKey: "movementBinds",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">forward, left, back, right, fire, jump binds</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="w-[300px]">{String(row.getValue("movementBinds")) !== "nan" ? String(row.getValue("movementBinds")) : ""}</div>,
  },
  {
    accessorKey: "cfgLinks",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">CFG Links</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("cfgLinks");
      return <div className="w-[200px]">{value !== "nan" ? String(value) : ""}</div>;
    },
  },
]

export default function GearList() {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const table = useReactTable({
    data: gearData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      sorting,
      pagination,
    },
  })

  return (
    <div className="flex flex-col h-screen">
      <h1 className="text-3xl font-bold mb-6">Quake Live Setups and Settings</h1>
      <div className="flex items-center justify-between px-2 py-4">
        <div className="text-sm text-muted-foreground">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{" "}
          {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)}{" "}
          of {table.getFilteredRowModel().rows.length} entries
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-sm">Rows per page</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value))
              }}
              className="h-8 w-16 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
            >
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </div>
          <div className="flex w-[100px] items-center justify-center text-sm">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-grow overflow-auto">
        <div className="overflow-x-auto max-w-[1100px]">
          <Table className="w-auto">
              <TableHeader className="sticky top-0 z-10 bg-white border-b">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-b-2 border-gray-200">
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
                  table.getRowModel().rows.map((row, rowIndex) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      {row.getVisibleCells().map((cell, cellIndex) => (
                        <TableCell 
                          key={cell.id}
                          className={`${cellIndex === 0 ? "sticky left-0 bg-background" : ""} p-3 text-sm`}
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
      </div>
    </div>
  )
}

