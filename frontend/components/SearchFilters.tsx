'use client';

import type { Category, CompanyType } from '@/lib/types';

interface Filters {
  q: string;
  type: CompanyType | '';
  categoryId: string;
  province: string;
}

const PROVINCES = [
  'Harare',
  'Bulawayo',
  'Manicaland',
  'Mashonaland Central',
  'Mashonaland East',
  'Mashonaland West',
  'Masvingo',
  'Matabeleland North',
  'Matabeleland South',
  'Midlands',
];

export function SearchFilters({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  return (
    <div className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4 sm:p-6">
      <div className="sm:col-span-2">
        <label htmlFor="q" className="label">
          Search by name
        </label>
        <input
          id="q"
          type="text"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="e.g. Masimba Engineering"
          className="input"
        />
      </div>
      <div>
        <label htmlFor="type" className="label">
          Type
        </label>
        <select
          id="type"
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as CompanyType | '' })}
          className="input"
        >
          <option value="">All</option>
          <option value="SUPPLIER">Suppliers</option>
          <option value="MINE">Mines</option>
        </select>
      </div>
      <div>
        <label htmlFor="province" className="label">
          Province
        </label>
        <select
          id="province"
          value={value.province}
          onChange={(e) => onChange({ ...value, province: e.target.value })}
          className="input"
        >
          <option value="">All provinces</option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-4">
        <label htmlFor="categoryId" className="label">
          Category
        </label>
        <select
          id="categoryId"
          value={value.categoryId}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value })}
          className="input sm:w-auto"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
