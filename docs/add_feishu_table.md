# 飞书多维表 API
1. 存入多维表请求示例
> tenant_access_token与前面写入飞书知识库共用一套即可
> 

```
curl -i -X POST 'https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer t-g104**' \
    -d '{
        "fields": {
        "资讯":"原始资讯",
        "url":"原始资讯的URL",
        "标题":"大模型创作的笔记标题",
        "正文": "大模型创作的笔记正文",
        "Tags":"大模型生成的笔记Tags"
        "封面":[{"file_token": "DRiF……"}],
        "详情图":[{"file_token": "DRiF……"}],
        "创作时间":"YYYY-MM-DD"
    }
    }'
```

2. 相关字段补充说明：
- POST地址中的`{app_token}`和`{table_id}`为变量，从用户在配置页面填写的`表格 URL`中提取
    - 如果 url 为 https://bytesmore.feishu.cn/base/UQxWbiiaSa7oqssbIxLclGeVnrV?table=tblQqWO7UfZ3JNTB&view=vewHNkTAcq
    - 则 app_token 为 UQxWbiiaSa7oqssbIxLclGeVnrV，table_id为tblQqWO7UfZ3JNTB
    - Agent 单独配置在`.env`中
- 封面、详情图两个字段为附件字段，字符类型为数组，内容为上传图片的 file_token，通过上传素材 API 获取，此 API 中Authorization的值为`tenant_access_token`，parent_node的值为`app_token`。请求示例：

    ```
    curl --location --request POST 'https://open.feishu.cn/open-apis/drive/v1/medias/upload_all' \
    --header 'Content-Type: multipart/form-data' \
    --header 'Authorization: Bearer t-g104**' \
    --form 'file_name="01_cover_tools_ashy.png"' \
    --form 'parent_type="bitable_image"' \
    --form 'parent_node="FNj0bHIf1a0xiisG84uctZS9nzh"' \
    --form 'size="90834"' \
    --form 'file=@"/xxx/01_cover_tools_ashy.png"'
    ```

    返回示例：

    ```
    {
    "code": 0,
    "data": {
        "file_token": "BCQMbYnhoovJnNxvhiRcJsktnmd"
    },
    "msg": "Success"
    }
    ```
