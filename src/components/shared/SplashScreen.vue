<template>
  <Transition name="splash-fade">
    <div v-if="show" class="splash" aria-hidden="true">
      <img src="/floww-mark.svg" alt="" width="56" height="56" />
      <p class="splash__name">Floww</p>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: true }
})
</script>

<style lang="scss" scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--ground);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.splash__name {
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--text);
}

.splash-fade-leave-active { transition: opacity 0.2s ease; }
.splash-fade-leave-to { opacity: 0; }
</style>
