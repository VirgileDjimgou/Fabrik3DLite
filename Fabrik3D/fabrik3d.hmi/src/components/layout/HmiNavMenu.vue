<template>
  <div class="hmi-nav-menu">
    <button
      type="button"
      class="btn btn-outline-secondary btn-sm py-0"
      data-testid="hmi-nav-toggle"
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="hmi-nav-panel"
      @click="open = !open"
    >
      <i class="bi bi-list" aria-hidden="true"></i>
      <span class="ms-1">{{ t('navigation.menu') }}</span>
    </button>

    <nav
      v-if="open"
      id="hmi-nav-panel"
      class="hmi-nav-panel"
      :aria-label="t('navigation.menu')"
      data-testid="hmi-nav-panel"
    >
      <div v-for="group in groups" :key="group.id" class="hmi-nav-group">
        <h6 class="hmi-nav-group__title">{{ t(group.labelKey) }}</h6>
        <ul class="list-unstyled mb-0">
          <li v-for="entry in group.items" :key="entry.item.id">
            <router-link
              v-if="!entry.item.external"
              class="hmi-nav-link"
              :to="entry.href"
              :data-testid="`hmi-nav-${entry.item.id}`"
              @click="open = false"
            >
              <i class="bi" :class="entry.item.icon" aria-hidden="true"></i>
              <span>{{ t(entry.item.labelKey) }}</span>
            </router-link>
            <a
              v-else
              class="hmi-nav-link"
              :href="entry.href"
              target="_blank"
              rel="noopener noreferrer"
              :data-testid="`hmi-nav-${entry.item.id}`"
            >
              <i class="bi" :class="entry.item.icon" aria-hidden="true"></i>
              <span>{{ t(entry.item.labelKey) }}</span>
              <i class="bi bi-box-arrow-up-right ms-auto" aria-hidden="true"></i>
            </a>
          </li>
        </ul>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { canAdmin, canEngineer, canInstruct, canOperate, canRead } from '@/auth/authStore'
import { visibleNavGroups, type NavPermission } from '@/navigation/navCatalog'

const { t } = useI18n()
const open = ref(false)

const simulatorUrl = import.meta.env.VITE_SIMULATOR_URL as string | undefined

function can(permission: NavPermission): boolean {
  switch (permission) {
    case 'operate': return canOperate()
    case 'engineer': return canEngineer()
    case 'instruct': return canInstruct()
    case 'admin': return canAdmin()
    default: return canRead()
  }
}

const groups = computed(() => visibleNavGroups(can, simulatorUrl))
</script>

<style scoped>
.hmi-nav-menu { position: relative; display: inline-block; }
.hmi-nav-panel {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 40;
  min-width: 15rem;
  max-height: 70vh;
  overflow-y: auto;
  padding: 0.75rem;
  background: #fff;
  border: 1px solid var(--hmi-border, #ccc);
  border-radius: 0.4rem;
  box-shadow: 0 0.75rem 1.5rem rgb(0 0 0 / 18%);
}
.hmi-nav-group + .hmi-nav-group { margin-top: 0.75rem; }
.hmi-nav-group__title {
  margin: 0 0 0.25rem;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.65;
}
.hmi-nav-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.4rem 0.5rem;
  border-radius: 0.3rem;
  color: inherit;
  text-decoration: none;
}
.hmi-nav-link:hover, .hmi-nav-link:focus-visible { background: rgb(0 0 0 / 6%); }
</style>
