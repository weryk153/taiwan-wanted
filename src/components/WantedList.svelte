<script lang="ts">
  import type { WantedRecord } from "../lib/types";
  import { CATEGORIES } from "../lib/types";
  import { matches } from "../lib/search";
  import PosterGrid from "./PosterGrid.svelte";

  let { records }: { records: WantedRecord[] } = $props();
  let q = $state("");
  let source = $state("");
  let category = $state("");

  let shown = $derived.by(() =>
    records.filter((r) => {
      if (source && r.source !== source) return false;
      if (category && r.category !== category) return false;
      return matches(r, q);
    }),
  );
</script>

<div class="toolbar">
  <input type="search" placeholder="搜尋姓名、罪名、通緝機關" bind:value={q} aria-label="搜尋" />
  <select bind:value={source} aria-label="來源">
    <option value="">全部來源</option>
    <option value="cib">刑事局</option>
    <option value="mjib">調查局</option>
  </select>
  <select bind:value={category} aria-label="罪名類別">
    <option value="">全部類別</option>
    {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
  </select>
</div>
<p class="count">{shown.length === records.length ? `全部 ${records.length} 人` : `符合 ${shown.length} 人`}</p>
<PosterGrid records={shown} />
