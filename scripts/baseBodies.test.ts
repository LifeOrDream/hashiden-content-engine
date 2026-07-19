import assert from "node:assert/strict";
import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

type Variant = {
  variant: number;
  name: string;
  file: string;
};

type Country = {
  country_id: number;
  country: string;
  slug: string;
  variants: Variant[];
};

type Generation = {
  species_id: string;
  rebirth_level: number;
  asset_directory: string;
  countries: Country[];
};

type SpeciesRoster = {
  generations: Record<string, Generation>;
};

const SNAKE_CASE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EXPECTED_DIRECTORIES = [
  "rebirth_01",
  "rebirth_02",
  "rebirth_03",
  "rebirth_04",
  "rebirth_05",
  "rebirth_06",
];
const EXPECTED_COUNTRY_IDS = Array.from({ length: 12 }, (_, index) => index);
const EXPECTED_VARIANTS = [0, 1, 2, 3];
const baseBodiesDirectory = fileURLToPath(
  new URL("../assets/base_bodies/", import.meta.url),
);
const rosterPath = path.join(baseBodiesDirectory, "species_roster.json");
const roster = JSON.parse(readFileSync(rosterPath, "utf8")) as SpeciesRoster;

const generations = Object.entries(roster.generations);
assert.equal(generations.length, 6, "roster must define exactly six rebirth generations");
assert.deepEqual(
  generations.map(([, generation]) => generation.asset_directory).sort(),
  EXPECTED_DIRECTORIES,
  "roster must map to rebirth_01 through rebirth_06",
);

for (const [generationKey, generation] of generations) {
  const context = `generation ${generationKey}`;
  assert.equal(
    generation.rebirth_level,
    Number(generationKey),
    `${context}: rebirth_level must match its generation key`,
  );
  assert.match(
    generation.asset_directory,
    SNAKE_CASE,
    `${context}: asset directory must be snake_case`,
  );
  assert.equal(generation.countries.length, 12, `${context}: expected 12 countries`);

  const countryIds = generation.countries.map((country) => country.country_id).sort((a, b) => a - b);
  const countrySlugs = generation.countries.map((country) => country.slug);
  assert.deepEqual(countryIds, EXPECTED_COUNTRY_IDS, `${context}: country IDs must be 0 through 11`);
  assert.equal(new Set(countrySlugs).size, 12, `${context}: country slugs must be unique`);

  const expectedFiles: string[] = [];
  const speciesFiles = new Set<string>();
  const speciesNames = new Set<string>();

  for (const country of generation.countries) {
    const countryContext = `${context}, ${country.country}`;
    assert.match(country.slug, SNAKE_CASE, `${countryContext}: folder must be snake_case`);
    assert.equal(country.variants.length, 4, `${countryContext}: expected four species variants`);
    assert.deepEqual(
      country.variants.map((variant) => variant.variant).sort((a, b) => a - b),
      EXPECTED_VARIANTS,
      `${countryContext}: variant IDs must be 0 through 3`,
    );

    const countryFiles = new Set<string>();
    for (const variant of country.variants) {
      assert.match(
        variant.file,
        /^[a-z0-9]+(?:_[a-z0-9]+)*\.png$/,
        `${countryContext}: ${variant.file} must be a snake_case PNG filename`,
      );
      assert(!countryFiles.has(variant.file), `${countryContext}: duplicate species file ${variant.file}`);
      assert(!speciesFiles.has(variant.file), `${context}: duplicate species file ${variant.file}`);
      assert(!speciesNames.has(variant.name), `${context}: duplicate species name ${variant.name}`);

      countryFiles.add(variant.file);
      speciesFiles.add(variant.file);
      speciesNames.add(variant.name);
      expectedFiles.push(path.join(country.slug, variant.file));
    }
  }

  assert.equal(speciesFiles.size, 48, `${context}: expected 48 unique species files`);

  const generationDirectory = path.join(baseBodiesDirectory, generation.asset_directory);
  assert(statSync(generationDirectory).isDirectory(), `${context}: asset directory is missing`);

  const actualCountryFolders = readdirSync(generationDirectory, { withFileTypes: true })
    .map((entry) => {
      assert(entry.isDirectory(), `${context}: unexpected non-directory entry ${entry.name}`);
      assert.match(entry.name, SNAKE_CASE, `${context}: folder ${entry.name} must be snake_case`);
      return entry.name;
    })
    .sort();
  assert.deepEqual(
    actualCountryFolders,
    [...countrySlugs].sort(),
    `${context}: country folders must exactly match the roster`,
  );

  const actualFiles: string[] = [];
  for (const countrySlug of actualCountryFolders) {
    const countryDirectory = path.join(generationDirectory, countrySlug);
    for (const entry of readdirSync(countryDirectory, { withFileTypes: true })) {
      assert(entry.isFile(), `${context}: unexpected nested entry ${countrySlug}/${entry.name}`);
      assert.match(
        entry.name,
        /^[a-z0-9]+(?:_[a-z0-9]+)*\.png$/,
        `${context}: ${countrySlug}/${entry.name} must be a snake_case PNG filename`,
      );

      const relativeFile = path.join(countrySlug, entry.name);
      const absoluteFile = path.join(countryDirectory, entry.name);
      const signature = Buffer.alloc(PNG_SIGNATURE.length);
      const descriptor = openSync(absoluteFile, "r");
      try {
        assert.equal(
          readSync(descriptor, signature, 0, signature.length, 0),
          PNG_SIGNATURE.length,
          `${context}: ${relativeFile} is too short to be a PNG`,
        );
      } finally {
        closeSync(descriptor);
      }
      assert(signature.equals(PNG_SIGNATURE), `${context}: ${relativeFile} has an invalid PNG signature`);
      actualFiles.push(relativeFile);
    }
  }

  assert.deepEqual(
    actualFiles.sort(),
    expectedFiles.sort(),
    `${context}: files on disk must exactly match species_roster.json`,
  );
}

console.log("base body assets OK (6 rebirths, 72 country rosters, 288 PNGs)");
