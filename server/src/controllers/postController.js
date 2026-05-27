const crypto = require("crypto");
const mongoose = require("mongoose");
const Post = require("../models/Post");
const { memoryPosts } = require("../data/memoryStore");

const validCategories = new Set(["genel", "diger", "kafe", "doga", "etkinlik", "spor", "sanat", "yemek", "alisveris"]);
const validMoods = new Set(["calm", "social", "focus", "energy", "view"]);

function usesDatabase() {
  return mongoose.connection.readyState === 1;
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function normalizeTags(tags) {
  const source = Array.isArray(tags) ? tags : String(tags || "").split(",");
  return Array.from(
    new Set(
      source
        .map((tag) => String(tag).trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 6);
}

function normalizePost(post, viewerId = "", options = {}) {
  const { includeVideo = true } = options;
  const source = typeof post.toObject === "function" ? post.toObject() : post;
  const likedBy = source.likedBy || [];
  const reportedBy = source.reportedBy || [];

  return {
    _id: String(source._id),
    authorId: source.authorId || "",
    authorName: source.authorName || "Gezgin",
    authorAvatar: source.authorAvatar || "",
    description: source.description || "",
    lat: Number(source.lat),
    lng: Number(source.lng),
    placeName: source.placeName || "Konum",
    image: source.image || "",
    video: includeVideo ? source.video || "" : "",
    hasVideo: Boolean(source.video),
    postType: source.postType || "permanent",
    category: source.category || "genel",
    mood: source.mood || "calm",
    rating: Number(source.rating) || 0,
    tags: normalizeTags(source.tags),
    likes: Number(source.likes) || likedBy.length || 0,
    likedBy,
    viewerLiked: viewerId ? likedBy.includes(viewerId) : false,
    reportCount: Number(source.reportCount) || reportedBy.length || 0,
    viewerReported: viewerId ? reportedBy.includes(viewerId) : false,
    comments: source.comments || [],
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function validatePostInput({ description = "", image = "", video = "", lat, lng, tags = [] }) {
  const numericLat = Number(lat);
  const numericLng = Number(lng);

  if (!description.trim() && !image && !video) {
    return "Aciklama, fotograf veya video eklemelisin.";
  }

  if (description.length > 500) {
    return "Aciklama 500 karakterden uzun olamaz.";
  }

  if (normalizeTags(tags).join(",").length > 120) {
    return "Etiketler cok uzun.";
  }

  if (
    Number.isNaN(numericLat) ||
    Number.isNaN(numericLng) ||
    numericLat < -90 ||
    numericLat > 90 ||
    numericLng < -180 ||
    numericLng > 180
  ) {
    return "Gecersiz konum.";
  }

  return null;
}

function filterPosts(posts, req) {
  const category = String(req.query.category || "").trim();
  const q = String(req.query.q || "").trim().toLowerCase();

  return posts.filter((post) => {
    if (category && category !== "all" && post.category !== category) return false;
    if (!q) return true;

    const haystack = [
      post.placeName,
      post.description,
      post.authorName,
      post.category,
      post.mood,
      ...(post.tags || []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });
}

exports.getPosts = async (req, res) => {
  try {
    const hours24 = 24 * 60 * 60 * 1000;

    if (!usesDatabase()) {
      const activePosts = memoryPosts.filter((post) => {
        const isExpiredStory =
          post.postType === "story" &&
          new Date(post.createdAt).getTime() < Date.now() - hours24;
        const isSpam = (post.reportCount || 0) >= 3;
        return !isExpiredStory && !isSpam;
      });

      const posts = activePosts.map((post) => normalizePost(post, req.user?.id)).sort(sortNewest);
      return res.json(filterPosts(posts, req));
    }

    const hours24Ago = new Date(Date.now() - hours24);
    const mongoFilter = {
      $and: [
        {
          $or: [
            { reportCount: { $exists: false } },
            { reportCount: { $lt: 3 } },
          ],
        },
        {
          $or: [
            { postType: { $exists: false } },
            { postType: { $ne: "story" } },
            { postType: "story", createdAt: { $gt: hours24Ago } },
          ],
        },
      ],
    };

    const category = String(req.query.category || "").trim();
    if (category && category !== "all" && validCategories.has(category)) {
      mongoFilter.category = category;
    }

    const posts = await Post.find(mongoFilter).select("-video").sort({ createdAt: -1 }).limit(80);
    return res.json(filterPosts(posts.map((post) => normalizePost(post, req.user?.id, { includeVideo: false })), req));
  } catch (err) {
    console.error("getPosts hata:", err);
    return res.status(500).json({ message: "Postlar alinamadi" });
  }
};

exports.createPost = async (req, res) => {
  try {
    const {
      description = "",
      lat,
      lng,
      placeName = "Konum",
      image = "",
      video = "",
      postType = "permanent",
      category = "genel",
      mood = "calm",
      rating = 0,
      tags = [],
    } = req.body;

    const validationError = validatePostInput({ description, image, video, lat, lng, tags });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const payload = {
      authorId: req.user.id,
      authorName: req.user.displayName || req.user.avatarName || "Gezgin",
      authorAvatar: req.user.avatarName || "",
      description: description.trim(),
      lat: Number(lat),
      lng: Number(lng),
      placeName: String(placeName).trim() || "Konum",
      image,
      video,
      postType: ["story", "permanent"].includes(postType) ? postType : "permanent",
      category: validCategories.has(category) ? category : "genel",
      mood: validMoods.has(mood) ? mood : "calm",
      rating: Math.max(0, Math.min(5, Number(rating) || 0)),
      tags: normalizeTags(tags),
      likedBy: [],
      likes: 0,
      reportedBy: [],
      reportCount: 0,
      comments: [],
    };

    if (!usesDatabase()) {
      const now = new Date().toISOString();
      const post = {
        _id: createId(),
        ...payload,
        createdAt: now,
        updatedAt: now,
      };
      memoryPosts.unshift(post);
      return res.status(201).json(normalizePost(post, req.user.id));
    }

    const post = await Post.create(payload);
    return res.status(201).json(normalizePost(post, req.user.id));
  } catch (err) {
    console.error("createPost hata:", err);
    return res.status(500).json({ message: "Post olusturulamadi" });
  }
};

exports.likePost = async (req, res) => {
  try {
    if (!usesDatabase()) {
      const post = memoryPosts.find((item) => item._id === req.params.id);
      if (!post) return res.status(404).json({ message: "Post bulunamadi" });

      const likedBy = post.likedBy || [];
      const liked = likedBy.includes(req.user.id);
      post.likedBy = liked ? likedBy.filter((id) => id !== req.user.id) : [...likedBy, req.user.id];
      post.likes = liked ? Math.max(0, (post.likes || 0) - 1) : (post.likes || 0) + 1;
      post.updatedAt = new Date().toISOString();
      return res.json(normalizePost(post, req.user.id));
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post bulunamadi" });

    const liked = post.likedBy.includes(req.user.id);
    if (liked) {
      post.likedBy = post.likedBy.filter((id) => id !== req.user.id);
      post.likes = Math.max(0, post.likes - 1);
    } else {
      post.likedBy.push(req.user.id);
      post.likes += 1;
    }

    await post.save();
    return res.json(normalizePost(post, req.user.id));
  } catch (err) {
    console.error("likePost hata:", err);
    return res.status(500).json({ message: "Begeni islemi basarisiz" });
  }
};

exports.commentPost = async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (text.length < 2) {
      return res.status(400).json({ message: "Yorum en az 2 karakter olmali." });
    }
    if (text.length > 300) {
      return res.status(400).json({ message: "Yorum 300 karakterden uzun olamaz." });
    }

    const comment = {
      _id: createId(),
      userId: req.user.id,
      userName: req.user.displayName || req.user.avatarName || "Gezgin",
      text,
      createdAt: new Date(),
    };

    if (!usesDatabase()) {
      const post = memoryPosts.find((item) => item._id === req.params.id);
      if (!post) return res.status(404).json({ message: "Post bulunamadi" });
      post.comments = [...(post.comments || []), comment];
      post.updatedAt = new Date().toISOString();
      return res.status(201).json(normalizePost(post, req.user.id));
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post bulunamadi" });
    post.comments.push(comment);
    await post.save();
    return res.status(201).json(normalizePost(post, req.user.id));
  } catch (err) {
    console.error("commentPost hata:", err);
    return res.status(500).json({ message: "Yorum eklenemedi" });
  }
};

exports.reportPost = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!usesDatabase()) {
      const post = memoryPosts.find((item) => item._id === req.params.id);
      if (!post) return res.status(404).json({ message: "Post bulunamadi" });

      const reportedBy = post.reportedBy || [];
      if (reportedBy.includes(userId)) {
        return res.status(400).json({ message: "Bu paylasimi zaten sikayet ettiniz." });
      }

      post.reportedBy = [...reportedBy, userId];
      post.reportCount = (post.reportCount || 0) + 1;
      post.updatedAt = new Date().toISOString();
      return res.json(normalizePost(post, userId));
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post bulunamadi" });

    if (post.reportedBy.includes(userId)) {
      return res.status(400).json({ message: "Bu paylasimi zaten sikayet ettiniz." });
    }

    post.reportedBy.push(userId);
    post.reportCount = (post.reportCount || 0) + 1;
    await post.save();

    return res.json(normalizePost(post, userId));
  } catch (err) {
    console.error("reportPost hata:", err);
    return res.status(500).json({ message: "Sikayet islemi basarisiz" });
  }
};

exports.deletePost = async (req, res) => {
  try {
    if (!usesDatabase()) {
      const index = memoryPosts.findIndex((item) => item._id === req.params.id);
      if (index === -1) return res.status(404).json({ message: "Post bulunamadi" });
      if (memoryPosts[index].authorId !== req.user.id) {
        return res.status(403).json({ message: "Bu postu silme yetkin yok." });
      }
      memoryPosts.splice(index, 1);
      return res.json({ ok: true });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post bulunamadi" });
    if (post.authorId !== req.user.id) {
      return res.status(403).json({ message: "Bu postu silme yetkin yok." });
    }
    await post.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    console.error("deletePost hata:", err);
    return res.status(500).json({ message: "Post silinemedi" });
  }
};

function sortNewest(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
