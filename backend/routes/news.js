const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { fetchAllSources, fetchAndUpdateSource } = require('../services/rssService');
const { formatNewsForAINews, formatNewsForAITopics, formatNewsForAITools } = require('../services/llmService');
const { pushAINews } = require('../services/wechatService');
const { saveNewsToFeishu } = require('../services/feishuService');

// 获取资讯列表
router.get('/', (req, res) => {
  const { source_id, page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query, params;
  if (source_id) {
    query = `
      SELECT n.*, s.name as source_name, s.translate as source_translate
      FROM news n JOIN sources s ON n.source_id = s.id
      WHERE n.hidden = 0 AND n.source_id = ?
      ORDER BY n.pub_date DESC, n.fetched_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [source_id, parseInt(limit), offset];
  } else {
    query = `
      SELECT n.*, s.name as source_name, s.translate as source_translate
      FROM news n JOIN sources s ON n.source_id = s.id
      WHERE n.hidden = 0
      ORDER BY n.pub_date DESC, n.fetched_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [parseInt(limit), offset];
  }

  const news = db.prepare(query).all(...params);
  res.json({ success: true, data: news });
});

// 获取按信源分组的资讯
// ?agent=1 时额外过滤掉已推送（ai_newsed=1）的条目，避免 Agent 重复处理
router.get('/grouped', (req, res) => {
  const isAgent = req.query.agent === '1';
  const sources = db.prepare('SELECT * FROM sources WHERE enabled = 1 ORDER BY id').all();
  const result = sources.map((source) => {
    const extraFilter = isAgent ? 'AND ai_newsed = 0' : '';
    const items = db.prepare(`
      SELECT * FROM news 
      WHERE source_id = ? AND hidden = 0 ${extraFilter}
      ORDER BY pub_date DESC, fetched_at DESC 
      LIMIT 30
    `).all(source.id);
    return { source, items };
  });
  res.json({ success: true, data: result });
});

// 获取原始资讯（未过滤，含 hidden，按信源分组，资源页用）
router.get('/raw', (req, res) => {
  const sources = db.prepare('SELECT * FROM sources ORDER BY id').all();
  const result = sources.map((source) => {
    const items = db.prepare(`
      SELECT * FROM news 
      WHERE source_id = ?
      ORDER BY pub_date DESC, fetched_at DESC 
      LIMIT 50
    `).all(source.id);
    return { source, items };
  });
  res.json({ success: true, data: result });
});

// 获取已保存的资讯列表
router.get('/saved', (req, res) => {
  const items = db.prepare(`
    SELECT n.*, s.name as source_name
    FROM news n JOIN sources s ON n.source_id = s.id
    WHERE n.saved = 1
    ORDER BY n.saved_at DESC
    LIMIT 200
  `).all();
  res.json({ success: true, data: items });
});

/**
 * Agent 信息汇总接口：返回用于 Agent 学习选择规律的数据
 * - 最近 5 条已保存资讯（含 push_type）
 * - 最近 5 条已保存内容
 * - 对应时段的全量资讯标题列表（用于对比 Agent 学到哪些被选中）
 */
router.get('/agent-summary', (req, res) => {
  const savedNews = db.prepare(`
    SELECT n.id, n.title, n.translated_title, n.description, n.translated_description,
           n.link, n.pub_date, n.push_type, n.saved_at, s.name as source_name
    FROM news n JOIN sources s ON n.source_id = s.id
    WHERE n.saved = 1
    ORDER BY n.saved_at DESC
    LIMIT 5
  `).all();

  const savedContents = db.prepare(`
    SELECT sc.*, n.title as news_title, n.link as news_link
    FROM saved_contents sc
    LEFT JOIN news n ON sc.news_id = n.id
    ORDER BY sc.created_at DESC
    LIMIT 5
  `).all().map((item) => ({
    ...item,
    detail_urls: (() => { try { return JSON.parse(item.detail_urls); } catch { return []; } })(),
  }));

  // 取最近时段（最早保存记录往前推 24h）对应的全量资讯标题
  const earliestSavedAt = savedNews.length > 0
    ? savedNews[savedNews.length - 1].saved_at
    : new Date(Date.now() - 86400000).toISOString();

  const allNewsInPeriod = db.prepare(`
    SELECT n.id, n.title, n.translated_title, n.hidden, n.saved, n.ai_newsed, n.push_type,
           n.pub_date, s.name as source_name
    FROM news n JOIN sources s ON n.source_id = s.id
    WHERE n.fetched_at >= datetime(?, '-1 day')
    ORDER BY n.pub_date DESC
    LIMIT 100
  `).all(earliestSavedAt);

  res.json({
    success: true,
    data: {
      saved_news: savedNews,
      saved_contents: savedContents,
      all_news_in_period: allNewsInPeriod,
    },
  });
});

// 拉取资讯（全部或指定信源）
router.post('/fetch', async (req, res) => {
  const { source_id } = req.body;
  try {
    let results;
    if (source_id) {
      const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(source_id);
      if (!source) return res.status(404).json({ success: false, error: '信源不存在' });
      const r = await fetchAndUpdateSource(source);
      results = [r];
    } else {
      results = await fetchAllSources();
    }
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 隐藏/移除资讯
router.post('/:id/hide', (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE news SET hidden = 1 WHERE id = ?').run(id);
  res.json({ success: true });
});

// 保存资讯
router.post('/:id/save', (req, res) => {
  const { id } = req.params;
  db.prepare("UPDATE news SET saved = 1, saved_at = datetime('now') WHERE id = ?").run(id);
  res.json({ success: true });
});

// 取消保存资讯
router.post('/:id/unsave', (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE news SET saved = 0, saved_at = NULL WHERE id = ?').run(id);
  res.json({ success: true });
});

/**
 * 通用推送核心逻辑
 * 支持两种模式：
 *   1. 人工模式（human）：调用 LLM 生成内容（原有行为）
 *   2. Agent 模式：body 中直接传入 news_title + news_summary，跳过 LLM
 */
async function doPush(id, type, overrideContent) {
  const item = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
  if (!item) throw Object.assign(new Error('资讯不存在'), { status: 404 });

  let newsTitle, newsSummary;

  if (overrideContent && overrideContent.news_title && overrideContent.news_summary) {
    // Agent 直接传入内容，跳过 LLM
    newsTitle = overrideContent.news_title;
    newsSummary = overrideContent.news_summary;
  } else {
    // 调用 LLM 生成（人工推送按钮走此路径）
    let formatted;
    if (type === 'ainews') {
      formatted = await formatNewsForAINews(item.translated_title || item.title, item.translated_description || item.description);
    } else if (type === 'aitopics') {
      formatted = await formatNewsForAITopics(item.translated_title || item.title, item.translated_description || item.description);
    } else if (type === 'aitools') {
      formatted = await formatNewsForAITools(item.translated_title || item.title, item.translated_description || item.description);
    } else {
      throw new Error('未知推送类型');
    }
    newsTitle = formatted.news_title;
    newsSummary = formatted.news_summary;
  }

  const tagMap = { ainews: '#AINews', aitopics: '#AITopic', aitools: '#AITools' };
  const emojiMap = { ainews: '🆕', aitopics: '💬', aitools: '🛠' };
  const tag = tagMap[type] || '#AINews';
  const feishuEmoji = emojiMap[type] || '🆕';
  const sourceUrl = item.link;

  const [wechatResult, feishuResult] = await Promise.allSettled([
    pushAINews(newsTitle, newsSummary, tag),
    saveNewsToFeishu(newsTitle, newsSummary, sourceUrl, feishuEmoji),
  ]);

  // 推送后自动保存，标记推送类型
  db.prepare(`
    UPDATE news SET ai_newsed = 1, saved = 1, saved_at = datetime('now'), push_type = ?
    WHERE id = ?
  `).run(type, id);

  return {
    news_id: id,
    news_title: newsTitle,
    news_summary: newsSummary,
    wechat: wechatResult.status === 'fulfilled' ? wechatResult.value : { error: wechatResult.reason?.message },
    feishu: feishuResult.status === 'fulfilled' ? feishuResult.value : { error: feishuResult.reason?.message },
  };
}

// 加入 AINews（人工 + Agent 共用）
router.post('/:id/ainews', async (req, res) => {
  try {
    const data = await doPush(req.params.id, 'ainews', req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 加入 AITopics
router.post('/:id/aitopics', async (req, res) => {
  try {
    const data = await doPush(req.params.id, 'aitopics', req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 加入 AITools
router.post('/:id/aitools', async (req, res) => {
  try {
    const data = await doPush(req.params.id, 'aitools', req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 获取单条资讯详情
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const item = db.prepare(`
    SELECT n.*, s.name as source_name 
    FROM news n JOIN sources s ON n.source_id = s.id
    WHERE n.id = ?
  `).get(id);
  if (!item) return res.status(404).json({ success: false, error: '资讯不存在' });
  res.json({ success: true, data: item });
});

module.exports = router;
