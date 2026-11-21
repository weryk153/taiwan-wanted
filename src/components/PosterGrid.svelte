<script lang="ts">
  import type { WantedRecord } from "../lib/types";
  let { records }: { records: WantedRecord[] } = $props();
  const SOURCE_LABEL: Record<string, string> = { cib: "刑事局", mjib: "調查局" };
</script>

<div class="grid">
  {#each records as r (r.id)}
    <a class="poster" href={`/p/${r.id}`} data-card={r.id}>
      <div class="head">
        <span class="stamp">通緝</span>
        <span class="src">{SOURCE_LABEL[r.source]}公告</span>
      </div>
      <div class="pic">
        {#if r.photo}
          <img src={`/${r.photo}`} alt={`${r.name} 照片`} loading="lazy" width="240" height="300" />
        {:else}
          <span class="noimg">官方未提供照片</span>
        {/if}
      </div>
      <div class="name">{r.name}</div>
      {#if r.nameEn}<div class="name-en">{r.nameEn}</div>{/if}
      <div class="born">{r.birthYear ? `${r.birthYear} 年生` : "出生年不詳"}</div>
      <dl class="rows">
        <dt>罪名</dt><dd class="cat">{r.accusation || r.category}</dd>
        <dt>通緝機關</dt><dd>{r.wantedUnit || "未載明"}</dd>
      </dl>
    </a>
  {/each}
</div>
