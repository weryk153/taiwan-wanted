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

<div class="toolbar" role="search" aria-label="篩選通緝公告">
  <label class="search-field"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" placeholder="搜尋姓名、罪名、通緝機關" bind:value={q} aria-label="搜尋" /></label>
  <label class="select-field"><span>公告來源</span>
  <select bind:value={source} aria-label="來源">
    <option value="">全部來源</option>
    <option value="cib">刑事局</option>
    <option value="mjib">調查局</option>
  </select>
  </label>
  <label class="select-field"><span>罪名類別</span>
  <select bind:value={category} aria-label="罪名類別">
    <option value="">全部類別</option>
    {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
  </select>
  </label>
</div>
<div class="result-bar"><p class="count">{shown.length === records.length ? `全部 ${records.length} 人` : `符合 ${shown.length} 人`}</p></div>
<PosterGrid records={shown} />
