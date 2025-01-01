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

// Types
type GamingMouse = {
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

type Mousepad = {
  mousepad: string
  diamondLobby: boolean
  boardzy: boolean
  material: string
  productLink: string
}

type Keyboard = {
  keyboard: string
  techless: boolean
  diamondLobby: boolean
  productLink: string
}

type Monitor = {
  monitor: string
  techless: boolean
  monitorsUnboxed: boolean
  size: string
  resolution: string
  panelTech: string
  refreshRate: string
}

// Sample data
const mouseData: GamingMouse[] = [
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
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - slight",
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
    shape: "Symmetrical",
    humpPlacement: "Center",
    sideCurvature: "Outward - slight",
    handCompatibility: "Flat",
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
    shape: "Symmetrical",
    humpPlacement: "Back - aggressive",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
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
    shape: "Symmetrical",
    humpPlacement: "Back - aggressive",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
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
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
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
    shape: "Symmetrical",
    humpPlacement: "Back - moderate",
    sideCurvature: "Outward - slight",
    handCompatibility: "Inward",
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

const mousepadData: Mousepad[] = [
  {
    mousepad: "Artisan HAYATE-OTSU",
    diamondLobby: false,
    boardzy: true,
    material: "Cloth",
    productLink: "https://www.amazon.de/s?k=Artisan+HAYATE-OTSU&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan HIEN",
    diamondLobby: false,
    boardzy: true,
    material: "Cloth",
    productLink: "https://www.amazon.de/s?k=Artisan+HIEN&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan Key-83",
    diamondLobby: false,
    boardzy: true,
    material: "Cloth",
    productLink: "https://www.amazon.de/s?k=Artisan+Key-83&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan RAIDEN",
    diamondLobby: false,
    boardzy: true,
    material: "Cloth",
    productLink: "https://www.amazon.de/s?k=Artisan+RAIDEN&linkCode=progamingge07-20&tag=ll2"
  },
  {
    mousepad: "Artisan Type-99",
    diamondLobby: false,
    boardzy: true,
    material: "Cloth",
    productLink: "https://www.amazon.de/s?k=Artisan+Type-99&linkCode=progamingge07-20&tag=ll2"
  }
]

const keyboardData: Keyboard[] = [
  {
    keyboard: "Wooting 80HE",
    techless: true,
    diamondLobby: true,
    productLink: "https://wooting.io/wooting-80he?partner_id=quakesettings"
  },
  {
    keyboard: "Keychron Q1 HE",
    techless: true,
    diamondLobby: true,
    productLink: "https://www.amazon.de/s?k=Keychron+Q1+HE&linkCode=progamingge07-20&tag=ll2"
  },
  {
    keyboard: "MCHOSE Ace 60 Pro",
    techless: false,
    diamondLobby: false,
    productLink: "https://www.amazon.de/s?k=MCHOSE+Ace+60+Pro&linkCode=progamingge07-20&tag=ll2"
  },
  {
    keyboard: "ATK 68 V2",
    techless: false,
    diamondLobby: false,
    productLink: "https://www.amazon.de/s?k=hall+effect+keyboard+iso&linkCode=ll2&tag=progamingge07-20"
  },
  {
    keyboard: "Wooting 60HE",
    techless: true,
    diamondLobby: true,
    productLink: "https://wooting.io/wooting-60he?partner_id=quakesettings"
  }
]

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

// Column definitions
const mouseColumns: ColumnDef<GamingMouse>[] = [
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
    cell: ({ row }) => <div className="w-[150px] font-medium">{row.getValue("mouse")}</div>,
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
    header: "Hump placement",
  },
  {
    accessorKey: "sideCurvature",
    header: "Side curvature",
  },
  {
    accessorKey: "handCompatibility",
    header: "Hand compatibility",
  },
  {
    accessorKey: "length",
    header: "Length (mm)",
    cell: ({ row }) => {
      const value = row.getValue("length") as number | null
      return <div className="font-mono text-right">{value != null ? value.toString() : "-"}</div>
    },
  },
  {
    accessorKey: "width",
    header: "Width (mm)",
    cell: ({ row }) => {
      const value = row.getValue("width") as number | null
      return <div className="font-mono text-right">{value != null ? value.toString() : "-"}</div>
    },
  },
  {
    accessorKey: "height",
    header: "Height (mm)",
    cell: ({ row }) => {
      const value = row.getValue("height") as number | null
      return <div className="font-mono text-right">{value != null ? value.toString() : "-"}</div>
    },
  },
  {
    accessorKey: "weight",
    header: "Weight (g)",
    cell: ({ row }) => {
      const value = row.getValue("weight") as number | null
      return <div className="font-mono text-right">{value != null ? value.toString() : "-"}</div>
    },
  },
  {
    accessorKey: "diamondLobby",
    header: "DiamondLobby",
    cell: ({ row }) => (
      <div className="text-center">
        {row.getValue("diamondLobby") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
  {
    accessorKey: "techless",
    header: "techless",
    cell: ({ row }) => (
      <div className="text-center">
        {row.getValue("techless") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
  {
    accessorKey: "boardzy",
    header: "boardzy",
    cell: ({ row }) => (
      <div className="text-center">
        {row.getValue("boardzy") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
  {
    accessorKey: "rocketJumpNinja",
    header: "Rocket Jump Ninja",
    cell: ({ row }) => (
      <div className="text-center">
        {row.getValue("rocketJumpNinja") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
]

const mousepadColumns: ColumnDef<Mousepad>[] = [
  {
    accessorKey: "mousepad",
    header: "Mousepad",
    cell: ({ row }) => (
      <div className="w-[300px]">
        <a 
          href={row.getValue("productLink") as string} 
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {row.getValue("mousepad") as string}
        </a>
      </div>
    ),
  },
  {
    accessorKey: "material",
    header: "Material",
    cell: ({ row }) => <div className="w-[100px]">{row.getValue("material") || "N/A"}</div>,
  },
  {
    accessorKey: "diamondLobby",
    header: "Diamond Lobby",
    cell: ({ row }) => (
      <div className="w-[70px] text-center">
        {row.getValue("diamondLobby") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
  {
    accessorKey: "boardzy",
    header: "boardzy",
    cell: ({ row }) => (
      <div className="w-[70px] text-center">
        {row.getValue("boardzy") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
]

const keyboardColumns: ColumnDef<Keyboard>[] = [
  {
    accessorKey: "keyboard",
    header: "Keyboard",
    cell: ({ row }) => (
      <div className="w-[300px]">
        <a 
          href={row.getValue("productLink") as string} 
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {row.getValue("keyboard") as string}
        </a>
      </div>
    ),
  },
  {
    accessorKey: "techless",
    header: "techless",
    cell: ({ row }) => (
      <div className="w-[60px] text-center">
        {row.getValue("techless") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
  {
    accessorKey: "diamondLobby",
    header: "Diamond Lobby",
    cell: ({ row }) => (
      <div className="w-[60px] text-center">
        {row.getValue("diamondLobby") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
]

const monitorColumns: ColumnDef<Monitor>[] = [
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
    header: "techless",
    cell: ({ row }) => (
      <div className="w-[60px] text-center">
        {row.getValue("techless") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
      </div>
    ),
  },
  {
    accessorKey: "monitorsUnboxed",
    header: "Monitors Unboxed",
    cell: ({ row }) => (
      <div className="w-[60px] text-center">
        {row.getValue("monitorsUnboxed") ? <CheckIcon className="h-4 w-4 mx-auto" /> : null}
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

export default function RecommendationsPage() {
  const [mouseSorting, setMouseSorting] = React.useState<SortingState>([])
  const [mousepadSorting, setMousepadSorting] = React.useState<SortingState>([])
  const [keyboardSorting, setKeyboardSorting] = React.useState<SortingState>([])
  const [monitorSorting, setMonitorSorting] = React.useState<SortingState>([])

  const mouseTable = useReactTable({
    data: mouseData,
    columns: mouseColumns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setMouseSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting: mouseSorting,
    },
  })

  const mousepadTable = useReactTable({
    data: mousepadData,
    columns: mousepadColumns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setMousepadSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting: mousepadSorting,
    },
  })

  const keyboardTable = useReactTable({
    data: keyboardData,
    columns: keyboardColumns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setKeyboardSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting: keyboardSorting,
    },
  })

  const monitorTable = useReactTable({
    data: monitorData,
    columns: monitorColumns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setMonitorSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting: monitorSorting,
    },
  })

  return (
    <main className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-2">Gear Recommendations</h1>
      <p className="text-gray-600 mb-6">Various reviewers recommendations for gaming pc peripherals at the end of 2024. You DONT need this, but it's nice:)</p>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-2">Gaming Mice</h2>
          <p className="mb-4">Comparison of selected gaming mice from relatively trusted sources.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {mouseTable.getHeaderGroups().map((headerGroup) => (
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
                {mouseTable.getRowModel().rows?.length ? (
                  mouseTable.getRowModel().rows.map((row) => (
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
                    <TableCell colSpan={mouseColumns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </ErrorBoundary>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-2">Mousepads</h2>
          <p className="mb-4">A selection of mousepads with different materials and surface types.</p>
          <div className="overflow-x-auto max-w-fit">
            <Table>
              <TableHeader>
                {mousepadTable.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="p-0">
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
                {mousepadTable.getRowModel().rows?.length ? (
                  mousepadTable.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={mousepadColumns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </ErrorBoundary>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-2">Keyboards</h2>
          <p className="mb-4">A handpicked range of gaming keyboards evaluated by experienced reviewers.</p>
          <div className="overflow-x-auto max-w-fit">
            <Table>
              <TableHeader>
                {keyboardTable.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="p-0">
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
                {keyboardTable.getRowModel().rows?.length ? (
                  keyboardTable.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={keyboardColumns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </ErrorBoundary>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-2">Monitors</h2>
          <p className="mb-4">A curated list of multiplayer gaming monitors with most important specs.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {monitorTable.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="p-0">
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
                {monitorTable.getRowModel().rows?.length ? (
                  monitorTable.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={monitorColumns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </ErrorBoundary>
    </main>
  )
}

