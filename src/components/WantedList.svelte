<script lang="ts">
  import type { WantedRecord } from "../lib/types";
  import { CATEGORIES } from "../lib/types";

  let { records }: { records: WantedRecord[] } = $props();
  let q = $state("");
  let source = $state("");
  let category = $state("");

  const SOURCE_LABEL: Record<string, string> = { cib: "刑事局", mjib: "調查局" };

  let shown = $derived.by(() => {
    const needle = q.trim();
    return records.filter((r) => {
      if (source && r.source !== source) return false;
      if (category && r.category !== category) return false;
      if (!needle) return true;
      return [r.name, r.nameEn, r.accusation, r.wantedUnit].some((v) => v?.includes(needle));
    });
  });
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
<div class="count">共 {shown.length} 筆</div>
<div class="grid">
  {#each shown as r (r.id)}
    <a class="card" href={`/p/${r.id}`} data-card={r.id}>
      {#if r.photo}
        <img src={`/${r.photo}`} alt={`${r.name} 照片`} loading="lazy" width="88" height="112" />
      {:else}
        <div class="noimg" aria-hidden="true"></div>
      {/if}
      <div>
        <div class="name">{r.name}</div>
        <div class="sub">{r.birthYear ? `${r.birthYear} 年生` : "出生年不詳"}</div>
        <div class="sub">{r.accusation || "罪名未載明"}</div>
        <div class="sub">{r.wantedUnit}</div>
        <div class="sub"><span class="tag cat">{r.category}</span><span class="tag">{SOURCE_LABEL[r.source]}</span></div>
      </div>
    </a>
  {/each}
</div>
