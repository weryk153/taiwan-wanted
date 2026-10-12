<script lang="ts">
  import type { WantedRecord } from "../lib/types";
  import { CATEGORIES } from "../lib/types";
  import { matches } from "../lib/search";

  let { records }: { records: WantedRecord[] } = $props();
  let q = $state("");
  let source = $state("");
  let category = $state("");
  let filtered = $derived(Boolean(q || source || category));
  function resetFilters() { q = ""; source = ""; category = ""; }

  const SOURCE_LABEL: Record<string, string> = { cib: "刑事局", mjib: "調查局" };

  let shown = $derived.by(() =>
    records.filter((r) => {
      if (source && r.source !== source) return false;
      if (category && r.category !== category) return false;
      return matches(r, q);
    }),
  );
</script>

<section class="list-section" aria-labelledby="list-title">
<div class="list-heading"><h2 id="list-title">通緝公告欄 <span>THE WANTED LIST</span></h2><span class="list-hint">點選海報查看完整公告 <span aria-hidden="true">↗</span></span></div>
<div class="toolbar" role="search" aria-label="篩選通緝公告">
  <label class="search-field"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" placeholder="搜尋姓名、罪名、通緝機關…" bind:value={q} aria-label="搜尋" /></label>
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
<div class="result-bar"><p class="count" role="status" aria-live="polite">{filtered ? "符合條件" : "全部公告"} <strong>{shown.length}</strong> 人<span>／共 {records.length} 人</span></p>{#if filtered}<button class="reset" onclick={resetFilters}>清除篩選 <span aria-hidden="true">×</span></button>{:else}<span class="result-note">依官方公開公告彙整</span>{/if}</div>
<div class="grid">
  {#each shown as r (r.id)}
    <a class="poster" href={`/p/${r.id}`} data-card={r.id}>
      <div class="head">
        <span class="poster-kicker">WANTED</span>
        <span class="src">{SOURCE_LABEL[r.source]}公告</span>
      </div>
      <div class="poster-title" aria-hidden="true"><span>通緝</span><span class="poster-category">{r.category}</span></div>
      <div class="pic">
        {#if r.photo}
          <img src={`/${r.photo}`} alt={`${r.name} 照片`} loading="lazy" width="240" height="300" />
        {:else}
          <span class="noimg">官方未提供照片</span>
        {/if}
      </div>
      <div class="identity"><h3 class="name">{r.name}</h3>
      {#if r.nameEn}<div class="name-en">{r.nameEn}</div>{/if}
      <div class="born">{r.birthYear ? `${r.birthYear} 年生` : "出生年不詳"}</div>
      </div>
      <dl class="rows">
        <dt>罪名</dt><dd class="cat">{r.accusation || r.category}</dd>
        <dt>通緝機關</dt><dd>{r.wantedUnit || "未載明"}</dd>
      </dl>
      <div class="poster-foot"><span>查看完整公告</span><span aria-hidden="true">↗</span></div>
    </a>
  {/each}
</div>
{#if shown.length === 0}<div class="empty-state"><span class="empty-mark" aria-hidden="true">查無公告</span><h3>沒有符合條件的通緝公告</h3><p>試試其他姓名、罪名，或清除篩選重新瀏覽。</p><button class="reset" onclick={resetFilters}>清除所有篩選 <span aria-hidden="true">↗</span></button></div>{/if}
</section>
