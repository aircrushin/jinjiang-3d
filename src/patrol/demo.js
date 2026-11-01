// 一键演示脚本：把巡检孪生台的主要能力按固定顺序走一遍，边走边在画面下方给出说明。
// 步骤按“等多久、等什么条件”编排，而不是写死时刻：智能体赶到现场要多久取决于它们当时在哪，
// 写死时刻会让说明和画面对不上。计时用模拟时间，所以暂停和倍速都对演示生效。

// 浮点累加会让 50 次 0.1 比 5 略小，不加容差的话每一步都可能多等一帧
const EPS = 1e-6;

// wait：上一步执行后至少等多少秒。until + max：wait 到了之后，再等条件成立，最多等到 max 秒。
export class DemoRunner {
  constructor(steps, ctx) {
    this.steps = steps;
    this.ctx = ctx;
    this.active = false;
    this.i = 0;
    this.since = 0;
    this.elapsed = 0;
  }

  start() {
    this.i = 0;
    this.since = 0;
    this.elapsed = 0;
    this.active = true;
    this.ctx.onStart?.();
  }

  stop(finished = false) {
    if (!this.active) return;
    this.active = false;
    this.ctx.onStop?.(finished);
  }

  tick(dt) {
    if (!this.active) return;
    this.elapsed += dt;
    this.since += dt;
    // wait 为 0 的步骤可以在同一帧里连着走；上限只是防止脚本写错时死循环
    for (let guard = 0; guard < 8 && this.active; guard++) {
      const s = this.steps[this.i];
      if (!s) return this.stop(true);
      if (this.since + EPS < s.wait) return;
      if (s.until && !s.until(this.ctx) && this.since + EPS < (s.max ?? s.wait)) return;
      this.i++;
      this.since = 0;
      s.run?.(this.ctx);
    }
  }
}

const patrolling = (ctx) => ['dog-1', 'drone-1'].find((id) => ctx.sim.agent(id)?.mode === 'patrol') ?? 'dog-1';
// 注入失败（同时事件太多）时 last 为空，后面的等待都直接放行
const detected = (ctx) => ctx.last == null || ctx.last.tDetect != null;
const closed = (ctx) => ctx.last == null || ctx.last.state === 'resolved';
// 字幕里的地点和发现者都取自实际发生的事件：设施是随机挑的，写死的话字幕会和画面对不上
const where = (inc) => (inc.place ? `${inc.sectorName}${inc.place}` : inc.sectorName);
const finder = (ctx) => {
  const by = ctx.last?.by;
  if (!by) return '巡逻中';
  if (by === 'camera') return '视频监控';
  return ctx.sim.agent(by)?.name ?? '巡逻中';
};
const lookAtLast = (ctx) => {
  if (ctx.last) ctx.focus(ctx.last.id, 'incident');
};

export const DEMO_STEPS = [
  {
    wait: 0,
    run: (ctx) => {
      ctx.auto(false);
      ctx.scene('bailuwan');
      ctx.caption('白鹭湾新经济总部功能区，科技生态园 A–E 区。机器狗、无人机和电动巡逻车沿道路自动巡逻。');
    },
  },
  { wait: 7, run: (ctx) => { ctx.focus('dog-1', 'agent'); ctx.caption('地面巡检：机器狗沿环线巡逻，边走边检测路面和设施。'); } },
  { wait: 8, run: (ctx) => { ctx.focus('drone-1', 'agent'); ctx.caption('空中巡检：无人机沿更短的航线巡航，一次看到的范围更大。'); } },
  {
    wait: 8,
    run: (ctx) => {
      ctx.scene('bailuwan');
      ctx.last = ctx.inject('smoke', { ahead: patrolling(ctx), meters: 90 });
      ctx.caption(ctx.last ? `模拟一起烟雾告警，地点：${where(ctx.last)}。` : '模拟一起烟雾告警。');
    },
  },
  { wait: 2, run: lookAtLast },
  { wait: 3, until: detected, max: 30, run: (ctx) => ctx.caption(`${finder(ctx)} 发现了异常，系统自动派单。烟雾风险高，空中确认和现场处置同时出发。`) },
  { wait: 6, run: (ctx) => ctx.caption('无人机飞去确认火情，无人车赶往现场。') },
  {
    wait: 5,
    until: closed,
    max: 80,
    run: (ctx) => {
      ctx.scene('bailuwan');
      ctx.caption(closed(ctx) ? '处置完成，智能体自动回到岗位，事件进入统计。' : '处置还在进行，先看下一个场景。');
    },
  },
  {
    wait: 4,
    run: (ctx) => {
      ctx.caption('也可以直接下指令：让无人机去 E 区巡查。');
      ctx.command('让无人机去 E 区巡查');
    },
  },
  {
    wait: 10,
    run: (ctx) => {
      ctx.last = ctx.inject('intruder', { ahead: patrolling(ctx), meters: 90 });
      ctx.caption(`再来一起异常闯入${ctx.last ? `，地点：${where(ctx.last)}` : ''}。系统按需要派出空中、地面和现场的智能体。`);
    },
  },
  { wait: 2, run: lookAtLast },
  { wait: 6, until: closed, max: 90, run: (ctx) => ctx.caption(closed(ctx) ? '闯入事件处置完毕。' : '处置还在进行，先看下一个场景。') },
  {
    wait: 3,
    run: (ctx) => {
      ctx.scene('bailuwan-night');
      ctx.last = ctx.inject('lamp');
      ctx.caption(`切到夜间。路灯故障只在夜间自动出现，这里模拟一起${ctx.last ? `（${where(ctx.last)}）` : ''}，派无人车前往检查。`);
    },
  },
  { wait: 3, run: lookAtLast },
  { wait: 6, until: closed, max: 60, run: (ctx) => ctx.caption(closed(ctx) ? '路灯报修完成。' : '检修还在进行。') },
  {
    wait: 3,
    run: (ctx) => {
      ctx.scene('bailuwan');
      const st = ctx.sim.stats();
      ctx.caption(
        st.resolved
          ? `演示结束。累计处置 ${st.resolved} 起，平均响应 ${Math.round(st.response)} 秒，平均闭环 ${Math.round(st.resolve)} 秒。以上均为模拟数据。`
          : '演示结束。以上均为模拟数据。',
      );
    },
  },
  { wait: 10 },
];
