export type Warehouse = {
  id: number;
  name: string;
  code: string;
  address?: {
    location: string;
  } | null;
  isDefault: boolean;
  // Location fields
  country?: string | null;
  division?: string | null;
  district?: string | null;
  area?: string | null;
  postCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapLabel?: string | null;
  geoFence?: any;
  coverageRadiusKm?: number | null;
  locationNote?: string | null;
  isMapEnabled?: boolean;
};

export type WarehouseForm = {
  name: string;
  code: string;
  address: string;
  isDefault: boolean;
  // Location fields
  country: string;
  division: string;
  district: string;
  area: string;
  postCode: string;
  latitude: string;
  longitude: string;
  mapLabel: string;
  coverageRadiusKm: string;
  locationNote: string;
  isMapEnabled: boolean;
};

export type WarehouseMapData = {
  id: number;
  name: string;
  code: string;
  district?: string | null;
  area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapLabel?: string | null;
  geoFence?: any;
  coverageRadiusKm?: number | null;
  isMapEnabled: boolean;
};
