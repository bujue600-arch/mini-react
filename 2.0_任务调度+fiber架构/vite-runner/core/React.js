// =============================================================================
// 一、createElement 体系：JSX → 虚拟 DOM
// =============================================================================

/**
 * 文本节点的虚拟 DOM 工厂函数
 *
 * 为什么要单独处理文本节点？
 *   JSX 中的字符串 "hello" 不是一个标签，不能用 document.createElement('hello')
 *   浏览器创建文本内容需要用 document.createTextNode('')
 *   所以要给它一个特殊标记 'TEXT_ELEMENT'，在创建真实 DOM 时区分处理
 *
 * @param text  文本内容，如 "hello"、数字 123
 */
function createTextNode(text) {
  return {
    type: "TEXT_ELEMENT",          // 标记：这是一个文本节点
    props: {
      nodeValue: text,             // 文本值，对应真实 DOM 的 nodeValue
      children: [],                // 文本节点没有子节点
    },
  };
}

/**
 * createElement — JSX 编译器转换的目标函数
 *
 * JSX 写法：<div id="title">hello</div>
 * 编译后：createElement('div', { id: 'title' }, 'hello')
 *
 * 这个函数把散落的参数聚合成一棵虚拟 DOM 树：
 *   - type:        标签名
 *   - props:       属性 + children
 *   - children:    自动收集剩余参数，统一成虚拟 DOM 对象数组
 *
 * @param type      标签名，如 'div'、'span'、'button'；或组件函数（后续阶段）
 * @param props     JSX 传入的属性对象（不含 children），如 { id: 'title', onClick: fn }
 * @param children  所有子节点，自动收集在剩余参数中
 */
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      // 关键：把字符串/数字子节点也转成虚拟 DOM 对象
      // 原因：后续代码统一处理 fiber，不需要区分"原始值"和"对象"
      // 'hello' -> createTextNode('hello')
      // {type:'span',...} -> 直接使用
      children: children.map((child) => {
        return typeof child === "string" || typeof child === "number"
          ? createTextNode(child)
          : child;
      }),
    },
  };
}

// =============================================================================
// 二、render — 入口，把虚拟 DOM "种子" 交给调度器
// =============================================================================

/**
 * render — React 和 ReactDOM 的边界函数
 *
 * 调用方：ReactDOM.createRoot(el).render(<App />)
 *
 * 这里只做一件事：初始化根 fiber，然后启动调度器
 * 渲染工作在 workLoop 中分帧执行，不会阻塞浏览器
 *
 * 为什么根 fiber 的 dom 直接是 container？
 *   因为 container（#root）已经是真实 DOM 了，不需要再创建
 *   它只是整棵 fiber 树的"根容器"，不是要渲染的节点
 *
 * @param el        App 组件的虚拟 DOM（经过 createElement 处理后的对象树）
 * @param container 真实 DOM 中的挂载点，document.querySelector('#root')
 */
function render(el, container) {
  nextWorkOfUnit = {
    dom: container,                // 根 fiber 的 dom 直接指向真实容器
    props: {
      children: [el],              // App 虚拟 DOM 作为 children 的第一个元素
    },
    // child / parent / sibling 暂时为 undefined
    // 由 initChildren 在遍历时动态构建
  };
}

// =============================================================================
// 三、调度器（Scheduler）：分帧执行，浏览器不卡顿
// =============================================================================

/**
 * nextWorkOfUnit — 整个调度系统的"断点记录器"
 *
 * 作用：
 *   - 每处理完一个 fiber，performWorkOfUnit 返回"下一个 fiber"
 *   - 这个值被保存到 nextWorkOfUnit 中
 *   - 当一帧的时间用完（shouldYield = true），while 退出
 *   - 下一帧 workLoop 被再次调用，从 nextWorkOfUnit 恢复，继续处理
 *
 * 为什么叫 "Work Of Unit"？
 *   "Unit" = 一个 fiber = 一个最小可调度单元
 *   每次循环只处理一个 fiber，处理完就可能让出
 *
 * 为什么放在函数外部（全局）？
 *   因为 workLoop 和 performWorkOfUnit 是两个分离的函数
 *   只有通过全局变量才能在不同调用之间传递"断点"
 */
let nextWorkOfUnit = null;

/**
 * workLoop — 帧循环，调度器的核心
 *
 * 核心思想：
 *   每帧末尾（raf 之后，paint 之前）检查浏览器是否空闲
 *   如果有空闲时间，就处理 fiber 任务
 *   如果时间不够，立刻停下，把"断点"留给下一帧
 *
 * 为什么需要 while 循环？
 *   因为一次空闲期可能够处理多个 fiber（如果节点很简单）
 *   每次处理完后重新检查时间，不浪费任何空闲
 *
 * 为什么最后要再次 requestIdleCallback(workLoop)？
 *   两种情况：
 *     1. nextWorkOfUnit != null（还没渲染完）-> 需要继续调度下一帧
 *     2. nextWorkOfUnit == null（渲染完了）-> 什么也不做，while 直接退出
 *
 * @param deadline  浏览器传入的对象
 *                   deadline.timeRemaining() = 剩余可用毫秒数（通常 0~50ms）
 *                   deadline.didTimeout        = 是否因强制超时被调用
 */
function workLoop(deadline) {
  let shouldYield = false;

  // 循环不变式：
  //   每次循环开始时，nextWorkOfUnit 指向"下一个要处理的 fiber"
  //   每次循环结束时，nextWorkOfUnit 更新为"再下一个"
  while (!shouldYield && nextWorkOfUnit) {
    nextWorkOfUnit = performWorkOfUnit(nextWorkOfUnit);
    // 执行一个 fiber 后，立刻检查时间够不够处理下一个
    shouldYield = deadline.timeRemaining() < 1;
  }

  // 注册下一帧的调度（无论本次是否做完）
  // 如果渲染已完成，nextWorkOfUnit 为 null，while 条件直接为 false，什么都不做
  requestIdleCallback(workLoop);
}

// =============================================================================
// 四、DOM 操作层：创建真实节点 & 设置属性
// =============================================================================

/**
 * createDom — 根据 fiber.type 创建对应的真实 DOM
 *
 * 为什么要区分 TEXT_ELEMENT？
 *   document.createElement('div')        -> 创建元素节点
 *   document.createTextNode('')          -> 创建文本节点
 *   这是两种完全不同的 API，不能混用
 *
 * @param type  'TEXT_ELEMENT' -> 文本节点 | 其他字符串 -> 普通元素节点
 */
function createDom(type) {
  return type === "TEXT_ELEMENT"
    ? document.createTextNode("")
    : document.createElement(type);
}

/**
 * updateProps — 把 props 中的属性同步到真实 DOM 上
 *
 * 处理范围：
 *   - 普通属性：dom.id = 'title'、dom.src = 'img.png'
 *   - 事件后续会处理：onClick -> click，onChange -> change
 *
 * 排除项：
 *   - children：这是子节点，不是属性，由 initChildren + append 处理
 *
 * @param dom    真实 DOM 节点
 * @param props  fiber.props 对象
 */
function updateProps(dom, props) {
  Object.keys(props).forEach((key) => {
    if (key !== "children") {
      dom[key] = props[key];
    }
  });
}

// =============================================================================
// 五、Fiber 链表构建 — 把树状虚拟 DOM 转成可遍历的链表结构
// =============================================================================

/**
 * initChildren — 把虚拟 DOM 的 children 数组展平成 Fiber 链表
 *
 * 链表结构图解：
 *
 *   虚拟 DOM（数组）：
 *     children: [p_node, p_node, span_node]
 *
 *   Fiber 链表（initChildren 后）：
 *     fiber.child ──► p_node(0) ──sibling─► p_node(1) ──sibling─► span_node(2)
 *                       │
 *                       └─child─┐
 *                               ▼
 *                         (由下一次 initChildren 展开)
 *
 * 为什么 sibling 是在"上一个 fiber"上设置的，而不是在当前 fiber 上？
 *   因为我们是从左到右遍历 children 的
 *   每遇到一个新 child，就把它挂在"上一个 child 的 sibling"上
 *   这样就串成了一条单向链表
 *
 * 为什么只需要 child + sibling 两个指针就够了？
 *   遍历时只有三种走法：往下（child）、往右（sibling）、往上（parent.sibling）
 *   单向链表完全覆盖这三种走法，不需要 parent 数组
 *
 * @param fiber  当前正在处理的 fiber，initChildren 在它上面构建 child / sibling 指针
 */
function initChildren(fiber) {
  const children = fiber.props.children;  // 虚拟 DOM 层的 children（数组）
  let prevChild = null;                   // 记住上一个 fiber，用于设置 sibling

  children.forEach((child, index) => {
    const newFiber = {
      type: child.type,
      props: child.props,
      child: null,       // 子链表由递归调用 initChildren 构建（下一个 workLoop 周期）
      parent: fiber,     // 回指父 fiber（用于"子树处理完，向上找叔叔"）
      sibling: null,     // 暂时 null，等下一个 child 来填
      dom: null,         // 真实 DOM 在 performWorkOfUnit 中创建
    };

    if (index === 0) {
      fiber.child = newFiber;       // 第一个子节点挂在 parent.child
    } else {
      prevChild.sibling = newFiber; // 后续子节点挂在 prevChild.sibling（串链表）
    }
    prevChild = newFiber;
  });
}

/**
 * performWorkOfUnit — 处理一个 fiber 的完整工作，并返回下一个 fiber
 *
 * 处理流程（三步，每步都不可省略）：
 *
 *   阶段 1 — 创建并挂载真实 DOM
 *     fiber.dom = createDom(fiber.type)     创建 DOM
 *     fiber.parent.dom.append(fiber.dom)    挂到父节点（父节点 DOM 已存在）
 *     updateProps(dom, fiber.props)         设置属性
 *
 *   阶段 2 — 构建子链表
 *     initChildren(fiber)                   在 fiber 上生成 child / sibling 指针
 *     为下一轮 workLoop 的遍历做好准备
 *
 *   阶段 3 — 确定下一个处理目标
 *     返回值决定遍历顺序，是深度优先遍历的具体实现
 *
 * 遍历顺序示例：
 *   DOM 结构：
 *     <A>
 *       <B><D/></B>
 *       <C><E/><F/></C>
 *     </A>
 *
 *   遍历顺序：
 *     A -> B -> D -> C -> E -> F
 *     （A 的 child = B，B 的 child = D，D 没有子节点也没有兄弟，回到 B；
 *      B 没有兄弟，回到 A；A 的 sibling = C，C 的 child = E，E -> F）
 *
 * @param  fiber 当前要处理的 fiber
 * @return       下一个要处理的 fiber
 *               - 有 child      → 返回 child（继续往深处走）
 *               - 无 child 有 sibling → 返回 sibling（子树完了，处理兄弟）
 *               - 都没有       → 返回 parent?.sibling（子树完了，找叔叔）
 *               - 根节点都没有 → 返回 undefined（整棵树处理完毕）
 */
function performWorkOfUnit(fiber) {
  // ---- 阶段 1：创建并挂载真实 DOM ----
  if (!fiber.dom) {
    fiber.dom = createDom(fiber.type);      // 创建：div / span / 文本节点
    fiber.parent.dom.append(fiber.dom);     // 挂载：父节点 DOM 已存在
    updateProps(fiber.dom, fiber.props);    // 设置：id / class / onClick 等
  }

  // ---- 阶段 2：构建子 fiber 链表 ----
  // 重要：这个调用执行后，fiber 上才有 child / sibling 指针
  // 否则下一轮 workLoop 就不知道往哪里走了
  initChildren(fiber);

  // ---- 阶段 3：返回下一个要处理的 fiber ----
  // 调度策略 = 深度优先（先处理完一个完整的子树，再处理下一个）
  // 实现：优先 child → 其次 sibling → 最后父节点的 sibling
  if (fiber.child) {
    return fiber.child;           // 有子节点 → 继续往深处走
  }

  if (fiber.sibling) {
    return fiber.sibling;        // 没子节点，有兄弟 → 处理兄弟
  }

  return fiber.parent?.sibling;   // 子节点和兄弟都没有 → 回到父节点，找叔叔（父的兄弟）
}

// =============================================================================
// 六、启动调度器
// =============================================================================

// requestIdleCallback(workLoop) 在页面加载时就注册了第一个调度周期
// 之后由 workLoop 内部递归注册自己，形成"自驱的帧循环"
// 只要 nextWorkOfUnit 还有值，这个循环就不会停止
requestIdleCallback(workLoop);

// =============================================================================
// 七、导出公共 API
// =============================================================================

const React = {
  render,
  createElement,
};

export default React;
