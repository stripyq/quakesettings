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

type Mouse = {
  mouse: string
  shape: string
  humpPlacement: string
  sideCurvature: string
  handCompatibility: string
  length: number | null
  width: number | null
  height: number | null
  weight: number | null
  diamondLobby: boolean
  techless: boolean
  boardzy: boolean
  rocketJumpNinja: boolean
}

const mouseData: Mouse[] = [
  {
    mouse: "Razer DeathAdder V3 Pro",
    shape: "Ergonomic",
    humpPlacement: "Center",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 128,
    width: 68,
    height: 44,
    weight: 44,
    diamondLobby: true,
    techless: true,
    boardzy: true,
    rocketJumpNinja: true
  },
  {
    mouse: "Lamzu Maya X",
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 124.4,
    width: 64.9,
    height: 39.6,
    weight: 39.6,
    diamondLobby: true,
    techless: false,
    boardzy: true,
    rocketJumpNinja: true
  },
  {
    mouse: "Zowie U2",
    shape: "Symmetrical",
    humpPlacement: "Back - minimal",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 123.3,
    width: 64.3,
    height: 38.1,
    weight: 38.1,
    diamondLobby: true,
    techless: true,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Endgame Gear OP1 8k",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Flat",
    handCompatibility: "Flat",
    length: 118.2,
    width: 60.5,
    height: 37.2,
    weight: 37.2,
    diamondLobby: true,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Lamzu Maya",
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 119,
    width: 62,
    height: 38,
    weight: 38,
    diamondLobby: true,
    techless: false,
    boardzy: false,
    rocketJumpNinja: true
  },
  {
    mouse: "Logitech G Pro X Superlight II",
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - slight",
    handCompatibility: "Flat",
    length: 125,
    width: 63.5,
    height: 40,
    weight: 40,
    diamondLobby: false,
    techless: true,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Razer Viper V2 Pro",
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - moderate",
    handCompatibility: "Inward",
    length: 126.7,
    width: 66,
    height: 37.8,
    weight: 37.8,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: true
  },
  {
    mouse: "ASUS ROG Harpe Ace",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Outward - slight",
    handCompatibility: "Flat",
    length: 127.5,
    width: 63.7,
    height: 39.6,
    weight: 39.6,
    diamondLobby: false,
    techless: false,
    boardzy: false,
    rocketJumpNinja: true
  },
  {
    mouse: "ATK X1 Ultimate",
    shape: "Symmetrical",
    humpPlacement: "Back - minimal",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 127,
    width: 64,
    height: 40,
    weight: 40,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Endgame Gear XM2w 4k",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Flat",
    handCompatibility: "Inward - aggressive",
    length: 122,
    width: 66,
    height: 38.5,
    weight: 38.5,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Fantech Helios II Pro S",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 120,
    width: 64,
    height: 38.3,
    weight: 38.3,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Finalmouse UltralightX",
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - moderate",
    handCompatibility: "Inward",
    length: null,
    width: null,
    height: null,
    weight: null,
    diamondLobby: false,
    techless: false,
    boardzy: false,
    rocketJumpNinja: true
  },
  {
    mouse: "G-Wolves Hati S2 8K",
    shape: "",
    humpPlacement: "",
    sideCurvature: "",
    handCompatibility: "",
    length: null,
    width: null,
    height: null,
    weight: null,
    diamondLobby: false,
    techless: false,
    boardzy: false,
    rocketJumpNinja: true
  },
  {
    mouse: "Lamzu Atlantis",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Flat",
    handCompatibility: "Inward - aggressive",
    length: 123,
    width: 66,
    height: 38,
    weight: 38,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Logitech G Pro Hero",
    shape: "",
    humpPlacement: "",
    sideCurvature: "",
    handCompatibility: "",
    length: null,
    width: null,
    height: null,
    weight: null,
    diamondLobby: false,
    techless: true,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Logitech G Pro X Superlight",
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - slight",
    handCompatibility: "Flat",
    length: 125,
    width: 63.5,
    height: 40,
    weight: 40,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Logitech G203 Lightsync",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Inward - moderate",
    handCompatibility: "Flat",
    length: 116.6,
    width: 62.2,
    height: 38.2,
    weight: 38.2,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Logitech G305 Lightspeed",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Inward - moderate",
    handCompatibility: "Flat",
    length: 116.6,
    width: 62.2,
    height: 38.2,
    weight: 38.2,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Logitech G402 Hyperion Fury",
    shape: "Ergonomic",
    humpPlacement: "Back - minimal",
    sideCurvature: "Inward - slight",
    handCompatibility: "Inward",
    length: 136,
    width: 72,
    height: 41,
    weight: 41,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Ninjutso Sora V2",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 119.2,
    width: 59.8,
    height: 37.7,
    weight: 37.7,
    diamondLobby: false,
    techless: true,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Pulsar X2H",
    shape: "Symmetrical",
    humpPlacement: "Back - aggressive",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 120.4,
    width: 65,
    height: 39.1,
    weight: 39.1,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Pulsar X2H eS",
    shape: "Symmetrical",
    humpPlacement: "Back - aggressive",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 120.4,
    width: 65,
    height: 39.1,
    weight: 39.1,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Pulsar X2H Medium",
    shape: "",
    humpPlacement: "",
    sideCurvature: "",
    handCompatibility: "",
    length: null,
    width: null,
    height: null,
    weight: null,
    diamondLobby: true,
    techless: false,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Pulsar X2H Mini",
    shape: "Symmetrical",
    humpPlacement: "Back - aggressive",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 115.6,
    width: 62.4,
    height: 37.9,
    weight: 37.9,
    diamondLobby: false,
    techless: true,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Pulsar X2H V3 Medium",
    shape: "",
    humpPlacement: "",
    sideCurvature: "",
    handCompatibility: "",
    length: null,
    width: null,
    height: null,
    weight: null,
    diamondLobby: true,
    techless: false,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Pulsar X2V2",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Flat",
    handCompatibility: "Flat",
    length: 120,
    width: 63,
    height: 38,
    weight: 38,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Pwnage StormBreaker",
    shape: "Ergonomic",
    humpPlacement: "Center",
    sideCurvature: "Outward - moderate",
    handCompatibility: "Inward",
    length: 122,
    width: 64,
    height: 42,
    weight: 42,
    diamondLobby: false,
    techless: false,
    boardzy: false,
    rocketJumpNinja: true
  },
  {
    mouse: "Razer Viper V3 Pro",
    shape: "Symmetrical",
    humpPlacement: "Back - minimal",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 127.1,
    width: 63.9,
    height: 39.9,
    weight: 39.9,
    diamondLobby: false,
    techless: false,
    boardzy: false,
    rocketJumpNinja: true
  },
  {
    mouse: "Santali S1-O",
    shape: "",
    humpPlacement: "",
    sideCurvature: "",
    handCompatibility: "",
    length: null,
    width: null,
    height: null,
    weight: null,
    diamondLobby: false,
    techless: true,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Scyrox V8",
    shape: "Symmetrical",
    humpPlacement: "Back - aggressive",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 118,
    width: 63,
    height: 38,
    weight: 36,
    diamondLobby: true,
    techless: false,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "VAXEE XE Wireless 4K",
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: null,
    width: null,
    height: null,
    weight: null,
    diamondLobby: true,
    techless: true,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "VAXEE ZYGEN NP-01S Wireless 4K",
    shape: "Hybrid",
    humpPlacement: "Back - moderate",
    sideCurvature: "Outward - moderate",
    handCompatibility: "Inward",
    length: 120,
    width: 63,
    height: 37,
    weight: 37,
    diamondLobby: false,
    techless: true,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Waizowl Cloud",
    shape: "",
    humpPlacement: "",
    sideCurvature: "",
    handCompatibility: "",
    length: null,
    width: null,
    height: null,
    weight: null,
    diamondLobby: false,
    techless: true,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Waizowl OGM Pro V2",
    shape: "Hybrid",
    humpPlacement: "Center",
    sideCurvature: "Flat",
    handCompatibility: "Flat",
    length: 120,
    width: 65,
    height: 40,
    weight: 40,
    diamondLobby: false,
    techless: true,
    boardzy: false,
    rocketJumpNinja: false
  },
  {
    mouse: "Zowie S2-DW",
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 120,
    width: 64.2,
    height: 38.1,
    weight: 38.1,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  },
  {
    mouse: "Zowie ZA13-DW",
    shape: "Symmetrical",
    humpPlacement: "Back - aggressive",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
    length: 121.7,
    width: 62.8,
    height: 40.2,
    weight: 40.2,
    diamondLobby: false,
    techless: false,
    boardzy: true,
    rocketJumpNinja: false
  }
]

const productLinks: Record<string, string> = {
  "Razer DeathAdder V3 Pro": "https://www.amazon.de/dp/B09ZLV2531?linkCode=ll1&tag=progamingge07-20",
  "Lamzu Maya X": "https://www.amazon.de/s?k=Lamzu+Maya+X&linkCode=progamingge07-20&tag=ll2",
  "Zowie U2": "https://www.amazon.de/s?k=Zowie+U2&linkCode=progamingge07-20&tag=ll2",
  "Endgame Gear OP1 8k": "https://www.amazon.de/dp/B0CDCBDGGT?linkCode=ll1&tag=progamingge07-20",
  "Lamzu Maya": "https://www.amazon.de/s?k=Lamzu+Maya&linkCode=progamingge07-20&tag=ll2",
  "Logitech G Pro X Superlight II": "https://www.amazon.de/dp/B07W6JNYXV?linkCode=ll1&tag=progamingge07-20",
  "Razer Viper V2 Pro": "https://www.amazon.de/s?k=Razer+Viper+V2+Pro&linkCode=progamingge07-20&tag=ll2",
  "ASUS ROG Harpe Ace": "https://www.amazon.de/s?k=ASUS+ROG+Harpe+Ace&linkCode=progamingge07-20&tag=ll2",
  "ATK X1 Ultimate": "https://www.amazon.de/s?k=ATK+X1+Ultimate+gaming+mouse&linkCode=progamingge07-20&tag=ll2",
  "Endgame Gear XM2w 4k": "https://www.amazon.de/s?k=Endgame+Gear+XM2w+4k&linkCode=progamingge07-20&tag=ll2",
  "Fantech Helios II Pro S": "https://www.amazon.de/s?k=Fantech+Helios+II+Pro+S&linkCode=progamingge07-20&tag=ll2",
  "Finalmouse UltralightX": "https://www.amazon.de/s?k=Finalmouse+UltralightX+&linkCode=progamingge07-20&tag=ll2",
  "G-Wolves Hati S2 8K": "https://www.amazon.de/s?k=G-Wolves+Hati+S2+8K&linkCode=progamingge07-20&tag=ll2",
  "Lamzu Atlantis": "https://www.amazon.de/s?k=Lamzu+Atlantis&linkCode=progamingge07-20&tag=ll2",
  "Logitech G Pro Hero": "https://www.amazon.de/s?k=Logitech+G+Pro+Hero&linkCode=progamingge07-20&tag=ll2",
  "Logitech G Pro X Superlight": "https://www.amazon.de/dp/B07W4DHKTD?linkCode=ll1&tag=progamingge07-20",
  "Logitech G203 Lightsync": "https://www.amazon.de/s?k=Logitech+G203+Lightsync&linkCode=progamingge07-20&tag=ll2",
  "Logitech G305 Lightspeed": "https://www.amazon.de/s?k=Logitech+G305+Lightspeed&linkCode=progamingge07-20&tag=ll2",
  "Logitech G402 Hyperion Fury": "https://www.amazon.de/s?k=Logitech+G402+Hyperion+Fury&linkCode=progamingge07-20&tag=ll2",
  "Ninjutso Sora V2": "https://www.amazon.de/s?k=Ninjutso+Sora+V2&linkCode=progamingge07-20&tag=ll2",
  "Pulsar X2H": "https://www.amazon.de/s?k=Pulsar+X2H&linkCode=progamingge07-20&tag=ll2",
  "Pulsar X2H eS": "https://www.amazon.de/s?k=Pulsar+X2H+eS&linkCode=progamingge07-20&tag=ll2",
  "Pulsar X2H Medium": "https://www.amazon.de/s?k=Pulsar+X2H+Medium&linkCode=progamingge07-20&tag=ll2",
  "Pulsar X2H Mini": "https://www.amazon.de/s?k=Pulsar+X2H+Mini&linkCode=progamingge07-20&tag=ll2",
  "Pulsar X2H V3 Medium": "https://www.amazon.de/s?k=Pulsar+X2H+V3+Medium&linkCode=progamingge07-20&tag=ll2",
  "Pulsar X2V2": "https://www.amazon.de/s?k=Pulsar+X2V2&linkCode=progamingge07-20&tag=ll2",
  "Pwnage StormBreaker": "https://www.amazon.de/s?k=Pwnage+StormBreaker&linkCode=progamingge07-20&tag=ll2",
  "Razer Viper V3 Pro": "https://www.amazon.de/dp/B0CSPNCGL2?linkCode=ll1&tag=progamingge07-20",
  "Santali S1-O": "https://www.amazon.de/s?k=Santali+S1-O+gaming+mouse&linkCode=progamingge07-21&tag=ll3",
  "Scyrox V8": "https://www.amazon.de/s?k=Scyrox+V8+gaming+mouse&linkCode=progamingge07-22&tag=ll4",
  "VAXEE XE Wireless 4K": "https://www.amazon.de/s?k=VAXEE+XE+Wireless+4K+gaming+mouse&linkCode=progamingge07-23&tag=ll5",
  "VAXEE ZYGEN NP-01S Wireless 4K": "https://www.amazon.de/s?k=VAXEE+ZYGEN+NP-01S+Wireless+4K+gaming+mouse&linkCode=progamingge07-24&tag=ll6",
  "Waizowl Cloud": "https://www.amazon.de/s?k=Waizowl+Cloud+gaming+mouse&linkCode=progamingge07-25&tag=ll7",
  "Waizowl OGM Pro V2": "https://www.amazon.de/s?k=Waizowl+OGM+Pro+V2+gaming+mouse&linkCode=progamingge07-26&tag=ll8",
  "Zowie S2-DW": "https://www.amazon.de/s?k=Zowie+S2-DW&linkCode=progamingge07-27&tag=ll9",
  "Zowie ZA13-DW": "https://www.amazon.de/s?k=Zowie+ZA13-DW&linkCode=progamingge07-28&tag=ll10"
};

const columns: ColumnDef<Mouse>[] = [
  {
    accessorKey: "mouse",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full w-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Mouse</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const mouseName = row.getValue("mouse") as string;
      return (
        <div className="w-[200px] font-medium text-left whitespace-nowrap overflow-hidden text-ellipsis">
          <a href={productLinks[mouseName]} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            {mouseName}
          </a>
        </div>
      );
    },
  },
  {
    accessorKey: "shape",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Shape</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "humpPlacement",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Hump<br />placement</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-sm">{row.getValue("humpPlacement")}</div>,
  },
  {
    accessorKey: "sideCurvature",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Side<br />curvature</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-sm">{row.getValue("sideCurvature")}</div>,
  },
  {
    accessorKey: "handCompatibility",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Hand<br />compatibility</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-sm">{row.getValue("handCompatibility")}</div>,
  },
  {
    accessorKey: "length",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Length<br />(mm)</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("length") as number | null
      return <div className="text-right tabular-nums">{value !== null ? value.toFixed(1) : "-"}</div>
    },
  },
  {
    accessorKey: "width",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Width<br />(mm)</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("width") as number | null
      return <div className="text-right tabular-nums">{value !== null ? value.toFixed(1) : "-"}</div>
    },
  },
  {
    accessorKey: "height",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Height<br />(mm)</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("height") as number | null
      return <div className="text-right tabular-nums">{value !== null ? value.toFixed(1) : "-"}</div>
    },
  },
  {
    accessorKey: "weight",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-2 h-full flex flex-col items-center justify-between"
        >
          <span className="font-bold">Weight<br />(g)</span>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const value = row.getValue("weight") as number | null
      return <div className="text-right tabular-nums">{value !== null ? value.toFixed(1) : "-"}</div>
    },
  },
  {
    accessorKey: "diamondLobby",
    header: ({ column }) => {
      return (
        <div className="w-[60px]">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-2 h-[120px] flex flex-col items-center justify-between"
          >
            <span className="font-bold transform -rotate-60 text-left min-w-[120px] origin-top-left translate-x-6 translate-y-3">Diamond<br />Lobby</span>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[60px] flex items-center justify-center">
        {row.getValue("diamondLobby") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "techless",
    header: ({ column }) => {
      return (
        <div className="w-[60px]">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-2 h-[120px] flex flex-col items-center justify-between"
          >
            <span className="font-bold transform -rotate-60 text-center min-w-[120px] origin-top-lefttranslate-x-6 translate-y-3">techless</span>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[60px] flex items-center justify-center">
        {row.getValue("techless") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "boardzy",
    header: ({ column }) => {
      return (
        <div className="w-[60px]">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-2 h-[120px] flex flex-col items-center justify-between"
          >
            <span className="font-bold transform -rotate-60 text-left min-w-[120px] origin-top-left translate-x-6 translate-y-3">boardzy</span>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[60px] flex items-center justify-center">
        {row.getValue("boardzy") ? "✓" : ""}
      </div>
    ),
  },
  {
    accessorKey: "rocketJumpNinja",
    header: ({ column }) => {
      return (
        <div className="w-[60px]">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-2 h-[120px] flex flex-col items-center justify-between"
          >
            <span className="font-bold transform -rotate-60 text-left min-w-[120px] origin-top-left translate-x-6 translate-y-3">Rocket<br />Jump<br />Ninja</span>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="w-[60px] flex items-center justify-center">
        {row.getValue("rocketJumpNinja") ? "✓" : ""}
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

export default function MicePage() {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data: mouseData,
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
      <h1 className="text-3xl font-bold mb-2">Gaming Mouse Recommendations</h1>
      <Link href="/recommendations" className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to all recommendations
      </Link>
      <p className="text-gray-600 mb-6">A comprehensive comparison of gaming mice with detailed specifications and reviewer recommendations.</p>

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
                        className={`${index === 0 ? "sticky left-0 bg-background" : ""} py-2 px-4 ${
                          cell.column.id === 'diamondLobby' || cell.column.id === 'techless' || cell.column.id === 'boardzy' || cell.column.id === 'rocketJumpNinja' ? 'w-[60px]' : ''
                        }`}
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

